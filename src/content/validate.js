import { VERIFIED_ROUTES } from './contracts.js';
import { ID_RE } from './ids.js';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH = new Set(['required', 'optional', 'none']);
const REQUIRED = new Set(['yes', 'no', 'recommended', 'if-present']);
const BLOCKS = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'callout', 'table', 'code', 'cards', 'errorCodes']);
const TONES = new Set(['note', 'warning', 'danger', 'ok']);
const SECRET = /Password\s*=|Data Source=|Server=|BEGIN (RSA |OPENSSH )?PRIVATE KEY/i;
const LINK = /\(#\/([a-z0-9-]+)\)/g;

export function validateBundle(bundle) {
  const errors = [];
  const warnings = [];
  if (!bundle || typeof bundle !== 'object') {
    return { errors: ['El contenido no es un objeto JSON.'], warnings };
  }
  if (bundle.version !== 1) errors.push('La versión del contenido tiene que ser 1.');

  const site = bundle.site;
  if (!site || typeof site !== 'object') errors.push('Falta site.');
  else {
    if (!site.title) errors.push('Falta el título del sitio.');
    if (!site.baseUrl || typeof site.baseUrl !== 'string') errors.push('Falta la URL base.');
    else if (!/^https?:\/\//.test(site.baseUrl)) errors.push('La URL base tiene que empezar con http:// o https://.');
    if (!site.placeholders || typeof site.placeholders !== 'object' || Array.isArray(site.placeholders)) {
      errors.push('Faltan los valores ilustrativos.');
    }
  }

  const categories = bundle.catalog?.categories;
  if (!Array.isArray(categories)) {
    errors.push('El catálogo no tiene secciones.');
    return { errors, warnings };
  }

  const pages = bundle.pages;
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
    errors.push('Faltan las páginas.');
    return { errors, warnings };
  }

  const ids = new Set();
  const categoryIds = new Set();
  for (const category of categories) {
    if (!category || typeof category !== 'object') {
      errors.push('Hay una sección vacía.');
      continue;
    }
    const where = category.title || category.id || 'sección';
    if (!category.id || !ID_RE.test(category.id)) errors.push(`${where}: el id de la sección usa minúsculas y guiones.`);
    else if (categoryIds.has(category.id)) errors.push(`${category.id}: id de sección repetido.`);
    else categoryIds.add(category.id);
    if (!category.title) errors.push(`${category.id || where}: falta el título de la sección.`);
    if (!Array.isArray(category.items)) {
      errors.push(`${where}: la sección no tiene una lista de páginas.`);
      continue;
    }
    if (!category.items.length) warnings.push(`${category.title || category.id}: la sección no tiene páginas.`);
    for (const item of category.items) {
      if (!item?.id || (item.type !== 'guide' && item.type !== 'endpoint')) {
        errors.push(`${where}: hay una página sin id o sin tipo.`);
        continue;
      }
      if (ids.has(item.id)) errors.push(`${item.id}: está repetido en el catálogo.`);
      ids.add(item.id);
      const page = pages[item.id];
      if (!page) {
        errors.push(`${item.id}: está en el menú y no tiene contenido.`);
        continue;
      }
      validatePage(page, item, errors, warnings);
    }
  }

  for (const id of Object.keys(pages)) {
    if (!ids.has(id)) errors.push(`${id}: tiene contenido y no está en el menú.`);
  }

  for (const id of Object.keys(VERIFIED_ROUTES)) {
    if (!ids.has(id)) errors.push(`${id}: es una operación del contrato verificado y tiene que seguir en el menú.`);
  }

  const groups = bundle.errorCodes?.groups;
  const groupIds = new Set();
  if (!Array.isArray(groups)) errors.push('Faltan los grupos de códigos de error.');
  else {
    for (const group of groups) {
      const where = group?.title || group?.id || 'grupo de errores';
      if (!group?.id || !ID_RE.test(group.id)) errors.push(`${where}: el id del grupo usa minúsculas y guiones.`);
      else if (groupIds.has(group.id)) errors.push(`${group.id}: grupo de errores repetido.`);
      else groupIds.add(group.id);
      if (!group.title) errors.push(`${group.id || where}: falta el título del grupo.`);
      if (!Array.isArray(group.items)) {
        errors.push(`${where}: el grupo no tiene códigos.`);
        continue;
      }
      group.items.forEach((item, index) => {
        const at = `${where}, código ${index + 1}`;
        if (typeof item?.code !== 'number' || !Number.isFinite(item.code)) errors.push(`${at}: el código tiene que ser un número.`);
        if (!item?.name) errors.push(`${at}: falta el nombre.`);
        if (!item?.cause) warnings.push(`${at}: falta la causa.`);
      });
    }
  }

  walkStrings(bundle, (text) => {
    if (SECRET.test(text)) errors.push('El contenido parece incluir un secreto o una cadena de conexión.');
  });
  const missingLinks = new Set();
  walkStrings(bundle, (text) => {
    for (const match of text.matchAll(LINK)) {
      if (!ids.has(match[1])) missingLinks.add(match[1]);
    }
  });
  for (const id of missingLinks) warnings.push(`Hay un enlace a #/${id} y esa página no está en el menú.`);

  if (Array.isArray(groups)) {
    walkBlocks(bundle, (block, where) => {
      if (block?.type === 'errorCodes' && block.group && !groupIds.has(block.group)) {
        warnings.push(`${where}: el grupo de códigos "${block.group}" no existe.`);
      }
      if (block?.type === 'cards' && Array.isArray(block.items)) {
        for (const card of block.items) {
          if (card?.id && !ids.has(card.id)) warnings.push(`${where}: la tarjeta apunta a "${card.id}" y esa página no está.`);
        }
      }
    });
  }

  return { errors: unique(errors), warnings: unique(warnings) };
}

function validatePage(page, item, errors, warnings) {
  const where = item.id;
  if (page.id !== item.id) errors.push(`${where}: el id del contenido no coincide con el del menú.`);
  if (!page.title) errors.push(`${where}: falta el título.`);
  if (!page.summary) errors.push(`${where}: falta el resumen.`);
  if (item.type === 'guide') {
    if (!Array.isArray(page.blocks)) errors.push(`${where}: una guía necesita bloques.`);
    else page.blocks.forEach((block, index) => validateBlock(block, `${where}, bloque ${index + 1}`, errors));
    return;
  }

  if (!METHODS.has(page.method)) errors.push(`${where}: el método HTTP no es válido.`);
  if (!page.path || typeof page.path !== 'string' || !page.path.startsWith('/')) errors.push(`${where}: la ruta tiene que empezar con /.`);
  if (!AUTH.has(page.auth)) errors.push(`${where}: la autenticación tiene que ser obligatoria, opcional o ninguna.`);
  if (!page.source) errors.push(`${where}: falta el origen del contrato.`);
  const locked = VERIFIED_ROUTES[item.id];
  if (locked && (page.method !== locked[0] || page.path !== locked[1])) {
    errors.push(`${where}: el contrato verificado es ${locked[0]} ${locked[1]}. El panel no cambia la API.`);
  } else if (!locked) {
    warnings.push(`${where}: no está en el contrato verificado. El portal puede mostrarla; conviene contrastar método y ruta con la API.`);
  }
  if (page.path === '/api/' || page.path === '/api/wms/') warnings.push(`${where}: completá la ruta.`);
  if (page.auth === 'none' && Array.isArray(page.headers) && page.headers.some((header) => String(header?.name || '').toLowerCase() === 'authorization')) {
    warnings.push(`${where}: figura sin autenticación y también un header Authorization.`);
  }

  validateList(page.purpose, `${where}: propósito`, errors);
  validateList(page.considerations, `${where}: consideraciones`, errors);
  if (page.headers != null && !Array.isArray(page.headers)) errors.push(`${where}: los headers tienen que ser una lista.`);
  else (page.headers || []).forEach((header, index) => {
    if (!header?.name) errors.push(`${where}: el header ${index + 1} no tiene nombre.`);
    if (typeof header?.required !== 'boolean') errors.push(`${where}: el header ${header?.name || index + 1} tiene que marcar si es obligatorio.`);
  });
  validateParameters(page.parameters, where, errors);
  if (page.groups != null && !Array.isArray(page.groups)) errors.push(`${where}: los grupos de campos tienen que ser una lista.`);
  else (page.groups || []).forEach((group, index) => {
    if (!group?.title) errors.push(`${where}: el grupo de campos ${index + 1} no tiene título.`);
    validateParameters(group?.parameters, `${where}, ${group?.title || 'grupo'}`, errors);
  });
  if (page.notes != null && !Array.isArray(page.notes)) errors.push(`${where}: las notas tienen que ser una lista.`);
  else (page.notes || []).forEach((note, index) => {
    if (note?.tone && !TONES.has(note.tone)) errors.push(`${where}: la nota ${index + 1} tiene un tono desconocido.`);
    if (typeof note?.text !== 'string') errors.push(`${where}: la nota ${index + 1} no tiene texto.`);
  });
  if (page.errors != null && !Array.isArray(page.errors)) errors.push(`${where}: los errores tienen que ser una lista.`);
  else (page.errors || []).forEach((error, index) => {
    if (!error?.situation) errors.push(`${where}: el error ${index + 1} no tiene situación.`);
    if (error?.http == null || error.http === '') errors.push(`${where}: el error ${index + 1} no tiene código HTTP.`);
  });
  if (page.request === undefined) warnings.push(`${where}: no tiene request de ejemplo.`);
  else if (page.request === null || typeof page.request !== 'object') errors.push(`${where}: el request tiene que ser un objeto o un array JSON.`);
  if (!Array.isArray(page.responses)) errors.push(`${where}: las respuestas tienen que ser una lista.`);
  else page.responses.forEach((sample, index) => {
    if (!sample?.title) errors.push(`${where}: la respuesta ${index + 1} no tiene título.`);
    if (sample && !Object.prototype.hasOwnProperty.call(sample, 'body')) warnings.push(`${where}: la respuesta ${index + 1} no tiene cuerpo.`);
  });
  if (page.extraBlocks != null && !Array.isArray(page.extraBlocks)) errors.push(`${where}: los bloques extra tienen que ser una lista.`);
  else (page.extraBlocks || []).forEach((block, index) => validateBlock(block, `${where}, bloque extra ${index + 1}`, errors));
}

function validateParameters(parameters, where, errors) {
  if (parameters == null) return;
  if (!Array.isArray(parameters)) {
    errors.push(`${where}: los campos tienen que ser una lista.`);
    return;
  }
  parameters.forEach((parameter, index) => {
    const at = `${where}, campo ${parameter?.name || index + 1}`;
    if (!parameter?.name) errors.push(`${at}: falta el nombre.`);
    if (parameter?.required && !REQUIRED.has(parameter.required)) errors.push(`${at}: la obligatoriedad no es válida.`);
  });
}

function validateList(value, where, errors) {
  if (value == null) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) errors.push(`${where} tiene que ser una lista de textos.`);
}

function validateBlock(block, where, errors) {
  if (!block || !BLOCKS.has(block.type)) {
    errors.push(`${where}: tipo de bloque desconocido (${block?.type || 'vacío'}).`);
    return;
  }
  if (['h2', 'h3', 'p'].includes(block.type) && typeof block.text !== 'string') errors.push(`${where}: falta el texto.`);
  if (['ul', 'ol'].includes(block.type)) {
    if (!Array.isArray(block.items) || block.items.some((item) => typeof item !== 'string')) errors.push(`${where}: la lista debe tener textos.`);
  }
  if (block.type === 'callout') {
    if (typeof block.text !== 'string') errors.push(`${where}: falta el texto de la nota.`);
    if (block.tone && !TONES.has(block.tone)) errors.push(`${where}: tono desconocido.`);
  }
  if (block.type === 'table') {
    if (!Array.isArray(block.headers) || !block.headers.length) errors.push(`${where}: la tabla necesita columnas.`);
    else if (!Array.isArray(block.rows)) errors.push(`${where}: la tabla necesita filas.`);
    else {
      block.rows.forEach((row, index) => {
        if (!Array.isArray(row) || row.length !== block.headers.length || row.some((cell) => typeof cell !== 'string')) {
          errors.push(`${where}: la fila ${index + 1} no coincide con las columnas.`);
        }
      });
    }
  }
  if (block.type === 'code' && typeof block.code !== 'string') errors.push(`${where}: falta el código.`);
  if (block.type === 'cards') {
    if (!Array.isArray(block.items)) errors.push(`${where}: faltan las tarjetas.`);
    else block.items.forEach((card, index) => {
      if (!card?.id || !card?.title) errors.push(`${where}: la tarjeta ${index + 1} necesita id y título.`);
    });
  }
  if (block.type === 'errorCodes' && !block.group) errors.push(`${where}: falta el grupo de códigos.`);
}

function walkBlocks(bundle, visit) {
  for (const page of Object.values(bundle.pages || {})) {
    const where = page?.title || page?.id || 'página';
    (page?.blocks || []).forEach((block, index) => visit(block, `${where}, bloque ${index + 1}`));
    (page?.extraBlocks || []).forEach((block, index) => visit(block, `${where}, bloque extra ${index + 1}`));
  }
}

function walkStrings(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach((item) => walkStrings(item, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => walkStrings(item, visit));
}

function unique(items) {
  return [...new Set(items)];
}
