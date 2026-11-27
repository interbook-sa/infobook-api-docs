import { applyPlaceholders, buildCurl } from '../curl.js';
import { VERIFIED_ROUTES } from '../content/contracts.js';
import { esc, highlight } from '../format.js';
import { BLOCK_LABELS } from './templates.js';

const AUTH_OPTIONS = [
  ['required', 'Bearer obligatorio'],
  ['optional', 'Bearer opcional'],
  ['none', 'Sin autenticación']
];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => [method, method]);
const REQUIRED_OPTIONS = [
  ['yes', 'Sí'],
  ['no', 'No'],
  ['recommended', 'Recomendado'],
  ['if-present', 'Si enviás el objeto']
];
const IN_OPTIONS = [
  ['body', 'body'],
  ['path', 'path'],
  ['query', 'query'],
  ['header', 'header'],
  ['response', 'response']
];
const TONE_OPTIONS = [
  ['note', 'Nota'],
  ['warning', 'Advertencia'],
  ['danger', 'Importante'],
  ['ok', 'Correcto']
];
const LANG_OPTIONS = [
  ['bash', 'Bash'],
  ['powershell', 'PowerShell'],
  ['json', 'JSON'],
  ['text', 'Texto']
];
const KNOWN_PLACEHOLDERS = ['username', 'password', 'token', 'serviceCode', 'deliveryNumber', 'trackingCode'];
const PLACEHOLDER_LABELS = {
  username: 'Usuario ilustrativo',
  password: 'Contraseña ilustrativa',
  token: 'Token ilustrativo',
  serviceCode: 'serviceCode ilustrativo',
  deliveryNumber: 'deliveryNumber ilustrativo',
  trackingCode: 'trackingCode ilustrativo'
};

export function renderApp(state) {
  const previewId = state.selection.kind === 'page' ? state.selection.id : 'empezar';
  return `
    <div class="admin-app">
      <header class="admin-top">
        <a class="brand" href="./index.html#/empezar">
          <img src="./images/interbook-logo-white.png" alt="" width="900" height="137" />
        </a>
        <div class="admin-title">
          <strong>Administrar documentación</strong>
          <span data-chrome="status" class="admin-status ${state.dirty ? 'is-dirty' : ''}">${state.dirty ? 'Borrador local' : 'Igual a lo publicado'}</span>
        </div>
        <div class="admin-actions">
          <a class="ghost" data-chrome="preview" href="${esc(previewHref(state, previewId))}" target="_blank" rel="noopener">Vista previa</a>
          <button type="button" class="ghost" data-action="download">Exportar paquete</button>
          ${state.canPickDirectory ? '<button type="button" class="ghost" data-action="save-dir">Guardar en carpeta</button>' : ''}
          <button type="button" class="ghost" data-action="discard" data-chrome="discard" ${state.dirty ? '' : 'hidden'}>Descartar borrador</button>
          <a class="primary" href="#io">Importar</a>
        </div>
      </header>
      <div class="admin-banner ${state.dirty ? 'is-dirty' : ''}" data-chrome="banner">${esc(bannerText(state))}</div>
      ${state.notice ? `<div class="admin-notice" role="status"><span>${esc(state.notice)}</span><button type="button" class="mini" data-action="dismiss-notice">Cerrar</button></div>` : ''}
      ${state.saveError ? `<div class="admin-notice is-danger" role="alert">${esc(state.saveError)}</div>` : ''}
      <div class="admin-body">
        <nav class="admin-nav" aria-label="Contenido">${renderNav(state)}</nav>
        <main class="admin-main">
          ${renderReport(state.report)}
          ${renderMain(state)}
        </main>
      </div>
      ${state.confirm ? renderConfirm(state.confirm) : ''}
    </div>`;
}

export function renderReport(report) {
  const errors = report?.errors || [];
  const warnings = report?.warnings || [];
  return `
    <details class="report" ${errors.length ? 'open' : ''}>
      <summary data-chrome="count">${esc(reportSummary(errors, warnings))}</summary>
      <div data-chrome="report">${reportBody(errors, warnings)}</div>
    </details>`;
}

export function reportBody(errors, warnings) {
  return `
    ${errors.length ? `<ul class="report-errors">${errors.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
    ${warnings.length ? `<ul class="report-warnings">${warnings.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}`;
}

export function renderCurl(page, site) {
  if (!page?.method) return '';
  const env = exampleEnv(site);
  const body = page.request === undefined ? undefined : applyPlaceholders(page.request, env);
  const path = applyPlaceholders(String(page.path || ''), env);
  return ['bash', 'powershell'].map((shell) => {
    let code = '';
    try {
      code = buildCurl({
        method: page.method,
        path,
        auth: page.auth,
        body,
        env,
        shell
      });
    } catch {
      code = 'No se pudo armar el cURL con el request actual.';
    }
    const title = shell === 'powershell' ? 'PowerShell' : 'Bash';
    return `<section class="sample" data-curl="${shell}"><div class="sample-head"><span>${title}</span><button type="button" class="copy-btn" data-action="copy-text" data-copy="${encodeURIComponent(code)}">Copiar</button></div><pre>${highlight(code, shell === 'powershell' ? 'powershell' : 'bash')}</pre></section>`;
  }).join('');
}

function renderMain(state) {
  if (state.selection.kind === 'errors') return renderErrorCodes(state);
  if (state.selection.kind === 'io') return renderIo(state);
  if (state.selection.kind === 'category') return renderCategory(state);
  if (state.selection.kind === 'page') return renderPage(state);
  return renderSite(state);
}

function renderNav(state) {
  const categories = state.working.catalog.categories;
  return `
    <div class="nav-links">
      ${topLink('#site', 'Sitio', state.selection.kind === 'site')}
      ${topLink('#errors', 'Códigos de error', state.selection.kind === 'errors')}
      ${topLink('#io', 'Importar y exportar', state.selection.kind === 'io')}
    </div>
    ${categories.map((category, index) => `
      <section class="nav-group">
        <div class="nav-row">
          <a class="${state.selection.kind === 'category' && state.selection.id === category.id ? 'active' : ''}" href="#category/${esc(category.id)}" data-nav-category="${esc(category.id)}">${esc(category.title)}</a>
          ${orderButtons('catalog.categories', index, categories.length)}
        </div>
        ${category.items.map((item, itemIndex) => `
          <div class="nav-row indent">
            ${pageLink(item, state.working.pages[item.id], state.selection.kind === 'page' && state.selection.id === item.id)}
            ${orderButtons(`catalog.categories.${index}.items`, itemIndex, category.items.length)}
          </div>`).join('')}
      </section>`).join('')}
    <button type="button" class="ghost mini add-section" data-action="add-category">Nueva sección</button>`;
}

function renderSite(state) {
  const site = state.working.site;
  const placeholders = site.placeholders || {};
  const keys = [...KNOWN_PLACEHOLDERS, ...Object.keys(placeholders).filter((key) => !KNOWN_PLACEHOLDERS.includes(key))];
  return `
    <header class="editor-head"><h1>Sitio</h1><p>URL y valores que los ejemplos reemplazan. No son credenciales reales.</p></header>
    <section class="panel">
      ${field('Título', `<input data-path="site.title" value="${esc(site.title || '')}" />`)}
      ${field('URL base', `<input data-path="site.baseUrl" value="${esc(site.baseUrl || '')}" />`, 'Los ejemplos la usan como prefijo de cada ruta.')}
      <h2>Valores ilustrativos</h2>
      ${keys.map((key) => `
        <div class="inline-row">
          ${field(PLACEHOLDER_LABELS[key] || key, `<input data-path="site.placeholders.${esc(key)}" value="${esc(placeholders[key] || '')}" autocomplete="off" spellcheck="false" />`)}
          <button type="button" class="mini danger" data-action="remove-placeholder" data-key="${esc(key)}">Quitar</button>
        </div>`).join('')}
      <form class="inline-row" data-add-placeholder>
        <label class="field"><span>Nuevo identificador</span><input name="key" placeholder="warehouse" autocomplete="off" /></label>
        <label class="field"><span>Valor</span><input name="value" autocomplete="off" /></label>
        <button type="submit" class="ghost mini">Agregar</button>
      </form>
      <p class="hint">En los textos, <code>{{identificador}}</code> se reemplaza por el valor. El botón Datos de ejemplo de la documentación pública lista estas claves.</p>
    </section>`;
}

function renderErrorCodes(state) {
  const groups = state.working.errorCodes?.groups || [];
  return `
    <header class="editor-head"><h1>Códigos de error</h1><p>La guía de errores los muestra por grupo. El nombre del grupo es el id que usa el bloque "Tabla de códigos".</p></header>
    ${groups.map((group, index) => `
      <section class="panel">
        <header class="panel-head"><h2>${esc(group.title || 'Grupo')}</h2><span class="row-actions">${moveButtons('errorCodes.groups', index, groups.length)}</span></header>
        <div class="grid">
          ${field('Id', `<input data-path="errorCodes.groups.${index}.id" value="${esc(group.id || '')}" spellcheck="false" />`)}
          ${field('Título', `<input data-path="errorCodes.groups.${index}.title" value="${esc(group.title || '')}" />`)}
        </div>
        ${field('Nota', `<textarea data-path="errorCodes.groups.${index}.note">${esc(group.note || '')}</textarea>`)}
        ${(group.items || []).map((item, itemIndex) => `
          <article class="repeat">
            <header><strong>${esc(item.name || 'Código')}</strong><span class="row-actions">${moveButtons(`errorCodes.groups.${index}.items`, itemIndex, group.items.length)}</span></header>
            <div class="grid">
              ${field('Código', `<input data-kind="number" inputmode="decimal" data-path="errorCodes.groups.${index}.items.${itemIndex}.code" value="${esc(item.code ?? '')}" />`)}
              ${field('Nombre', `<input data-path="errorCodes.groups.${index}.items.${itemIndex}.name" value="${esc(item.name || '')}" spellcheck="false" />`)}
            </div>
            ${field('Causa', `<textarea data-path="errorCodes.groups.${index}.items.${itemIndex}.cause">${esc(item.cause || '')}</textarea>`)}
          </article>`).join('')}
        ${addButton(`errorCodes.groups.${index}.items`, 'errorItem', 'Agregar código')}
      </section>`).join('')}
    ${addButton('errorCodes.groups', 'errorGroup', 'Agregar grupo')}`;
}

function renderIo(state) {
  const preview = state.importPreview;
  return `
    <header class="editor-head">
      <h1>Importar y exportar</h1>
      <p>Hay tres momentos distintos. Conviene no mezclarlos.</p>
    </header>
    <section class="panel">
      <h2>Publicado</h2>
      <p>Es lo que ven los clientes. Sale de los archivos JSON del sitio. Este panel no los modifica por sí solo.</p>
      <h2>Borrador en este navegador</h2>
      <p>Es lo que editás acá. Queda en este equipo, en este navegador. Si cerrás la pestaña, sigue estando. Otro navegador o otra persona no lo ve.</p>
      <h2>Archivo exportado</h2>
      <p>Es una copia para entregar o para reemplazar los JSON publicados. Recién después de publicar esa copia cambia la documentación de los clientes.</p>
      <div class="inline-row">
        <button type="button" class="primary" data-action="download">Descargar paquete JSON</button>
        ${state.canPickDirectory ? '<button type="button" class="ghost" data-action="save-dir">Escribir archivos en una carpeta</button>' : '<p class="hint">Este navegador no puede elegir una carpeta. Descargá el paquete y reemplazá los JSON publicados a mano.</p>'}
        <button type="button" class="ghost" data-action="reload-published">Volver a leer lo publicado</button>
      </div>
    </section>
    <section class="panel">
      <h2>Importar</h2>
      <p>Podés subir el paquete <code>interbook-docs.json</code> o, juntos, <code>site.json</code>, <code>catalog.json</code>, <code>error-codes.json</code> y las páginas. Antes de reemplazar el borrador se revisa el formato y se guarda una copia.</p>
      <label class="ghost mini file-btn" for="import-file">Elegir archivos JSON</label>
      <input id="import-file" class="file-input" type="file" accept="application/json,.json" multiple data-import />
      ${preview?.error ? `<p class="field-error">${esc(preview.error)}</p>` : ''}
      ${preview?.summary ? `
        <h3>Qué cambiaría en el borrador</h3>
        ${summaryList(preview.summary)}
        <h3>Validación del archivo</h3>
        ${reportBody(preview.report.errors, preview.report.warnings) || '<p>Sin errores.</p>'}
        <button type="button" class="primary" data-action="apply-import" ${preview.report.errors.length ? 'disabled' : ''}>Aplicar al borrador</button>
        <button type="button" class="ghost" data-action="cancel-import">Cancelar</button>
        ${preview.report.errors.length ? '<p class="hint">Hay errores: corregí el archivo antes de aplicarlo. El borrador actual sigue igual.</p>' : ''}` : ''}
    </section>
    <section class="panel">
      <h2>Copias en este navegador</h2>
      <p>Se crea una copia antes de importar, descartar o restaurar. No es el sitio publicado.</p>
      ${(state.backups || []).length ? (state.backups || []).map((backup) => `
        <div class="inline-row">
          <span>${esc(formatWhen(backup.at))} — ${esc(backup.reason || 'Copia')}</span>
          <button type="button" class="mini" data-action="restore-backup" data-id="${esc(backup.id)}">Restaurar</button>
        </div>`).join('') : '<p class="hint">Todavía no hay copias.</p>'}
    </section>`;
}

function renderCategory(state) {
  const category = state.working.catalog.categories.find((item) => item.id === state.selection.id);
  if (!category) return '<p>Esa sección ya no está en el borrador.</p>';
  const index = state.working.catalog.categories.indexOf(category);
  const draft = state.formError?.categoryId === category.id ? state.formError.draft || {} : {};
  const locked = category.items.filter((item) => VERIFIED_ROUTES[item.id]);
  return `
    <header class="editor-head"><h1>${esc(category.title)}</h1><p>La sección ordena el menú. El contenido de cada página se edita aparte.</p></header>
    <section class="panel">
      <div class="grid">
        ${field('Título', `<input data-path="catalog.categories.${index}.title" value="${esc(category.title || '')}" />`)}
        ${field('Identificador', `<input data-rename-category="${index}" value="${esc(category.id)}" spellcheck="false" autocomplete="off" />`, 'Minúsculas y guiones. No se muestra en el menú público.')}
      </div>
      <ul class="plain-list">
        ${category.items.map((item) => `<li><a href="#page/${esc(item.id)}">${esc(state.working.pages[item.id]?.title || item.id)}</a></li>`).join('') || '<li>Todavía no hay páginas.</li>'}
      </ul>
      ${locked.length ? `<p class="hint">Incluye operaciones del contrato verificado (${locked.map((item) => esc(item.id)).join(', ')}). Por eso la sección no se puede eliminar.</p>` : `<button type="button" class="mini danger" data-action="delete-category" data-id="${esc(category.id)}">Eliminar sección</button>`}
    </section>
    <section class="panel">
      <h2>Nueva página</h2>
      <form data-create-page="${index}">
        <div class="grid">
          <label class="field"><span>Tipo</span><select name="type"><option value="endpoint" ${draft.type === 'guide' ? '' : 'selected'}>Operación HTTP</option><option value="guide" ${draft.type === 'guide' ? 'selected' : ''}>Guía</option></select></label>
          <label class="field"><span>Identificador</span><input name="id" value="${esc(draft.id || '')}" placeholder="estado-pedido" autocomplete="off" spellcheck="false" /></label>
          <label class="field"><span>Título</span><input name="title" value="${esc(draft.title || '')}" /></label>
        </div>
        ${state.formError?.categoryId === category.id ? `<p class="field-error">${esc(state.formError.message)}</p>` : ''}
        <button type="submit" class="primary">Crear en el borrador</button>
      </form>
    </section>`;
}

function renderPage(state) {
  const found = findItem(state, state.selection.id);
  const page = state.working.pages[state.selection.id];
  if (!found || !page) return '<p>Esa página ya no está en el borrador.</p>';
  const body = found.item.type === 'guide' ? renderGuide(state, page) : renderEndpoint(state, page);
  const locked = Boolean(VERIFIED_ROUTES[page.id]);
  return `
    ${body}
    <section class="panel danger-zone">
      ${locked
        ? '<p>Esta operación está en el contrato verificado. Podés corregir el texto. El método, la ruta y el id quedan fijos, y no se elimina: la API no se cambia desde acá.</p>'
        : `<p>Eliminar la saca del borrador local. Lo publicado sigue igual hasta una exportación.</p><button type="button" class="mini danger" data-action="delete-page" data-id="${esc(page.id)}">Eliminar página</button>`}
      <button type="button" class="ghost mini" data-action="download-page" data-id="${esc(page.id)}">Descargar esta página</button>
      <a class="ghost mini" href="${esc(previewHref(state, page.id))}" target="_blank" rel="noopener">Vista previa de esta página</a>
    </section>`;
}

function renderGuide(state, page) {
  return `
    ${identity(state, page)}
    <section class="panel">
      <h2>Bloques</h2>
      <p class="hint">En los textos, las comillas invertidas marcan código y [texto](#/id) enlaza otra página. <code>{{token}}</code> y el resto de los valores ilustrativos se reemplazan al publicar la vista.</p>
      ${renderBlocks(state, `pages.${page.id}.blocks`, page.blocks)}
    </section>`;
}

function renderEndpoint(state, page) {
  const locked = Boolean(VERIFIED_ROUTES[page.id]);
  const base = `pages.${page.id}`;
  const requestPath = `${base}.request`;
  return `
    <div class="editor-layout">
      <div>
        ${identity(state, page)}
        <section class="panel">
          <h2>Operación</h2>
          <div class="grid">
            ${field('Método', select(`${base}.method`, page.method, withCurrent(METHODS, page.method), locked ? 'disabled data-locked="1"' : ''))}
            ${field('Ruta', `<input data-path="${esc(`${base}.path`)}" value="${esc(page.path || '')}" spellcheck="false" ${locked ? 'readonly data-locked="1"' : ''} />`, 'Empieza con /. Es relativa a la URL base.')}
            ${field('Autenticación', select(`${base}.auth`, page.auth, AUTH_OPTIONS))}
          </div>
          ${field('Origen del contrato', `<input data-path="${esc(`${base}.source`)}" value="${esc(page.source || '')}" />`, 'Se muestra al pie de la página pública. Indicá el archivo de la API o quién confirmó el contrato.')}
          <h3>Para qué sirve</h3>
          ${stringList(`${base}.purpose`, page.purpose, 'Agregar párrafo')}
          <h3>Notas</h3>
          ${renderNotes(`${base}.notes`, page.notes)}
          <h3>Headers</h3>
          ${renderHeaders(`${base}.headers`, page.headers)}
          <h3>Parámetros</h3>
          ${renderParameters(`${base}.parameters`, page.parameters)}
          <h3>Grupos de campos</h3>
          <p class="hint">Sirven para campos de un objeto anidado o de la respuesta, cuando no van en la tabla principal.</p>
          ${renderGroups(page)}
          <h3>Errores HTTP</h3>
          ${renderHttpErrors(page)}
          <h3>Consideraciones</h3>
          ${stringList(`${base}.considerations`, page.considerations, 'Agregar consideración')}
          <h3>Bloques extra</h3>
          ${renderBlocks(state, `${base}.extraBlocks`, page.extraBlocks)}
        </section>
      </div>
      <aside class="editor-side">
        <section class="panel">
          <h2>Ejemplos</h2>
          <p class="hint">El cURL no se guarda. Se arma con el método, la ruta, la autenticación y el request, usando los valores ilustrativos del sitio.</p>
          <div data-live-curl>${renderCurl(page, state.working.site)}</div>
          ${field('Request', `<textarea class="code-input" spellcheck="false" data-kind="json" data-path="${esc(requestPath)}">${esc(jsonValue(state, requestPath, page.request))}</textarea>${jsonError(state, requestPath)}`, 'Objeto o array JSON.')}
          <h3>Respuestas</h3>
          ${renderResponses(state, page)}
        </section>
      </aside>
    </div>`;
}

function identity(state, page) {
  const found = findItem(state, page.id);
  const locked = Boolean(VERIFIED_ROUTES[page.id]);
  const base = `pages.${page.id}`;
  return `
    <header class="editor-head">
      <h1>${esc(page.title || page.id)}</h1>
      <p>${found?.item.type === 'guide' ? 'Guía' : `${esc(page.method || '')} ${esc(page.path || '')}`}</p>
    </header>
    <section class="panel">
      <h2>Identidad</h2>
      <div class="grid">
        ${field('Título', `<input data-path="${esc(`${base}.title`)}" value="${esc(page.title || '')}" />`)}
        ${field('Nombre en el menú', `<input data-path="${esc(`${base}.nav`)}" value="${esc(page.nav || '')}" />`, 'Si queda vacío, el menú usa el título.')}
        ${field('Identificador', `<input data-rename-page="${esc(page.id)}" value="${esc(page.id)}" spellcheck="false" autocomplete="off" ${locked ? 'readonly data-locked="1"' : ''} />`, 'Se usa en el enlace #/id.')}
        ${field('Sección', `<select data-action="move-page" data-id="${esc(page.id)}">${state.working.catalog.categories.map((category) => `<option value="${esc(category.id)}" ${category.id === found?.category.id ? 'selected' : ''}>${esc(category.title)}</option>`).join('')}</select>`)}
      </div>
      ${field('Resumen', `<textarea data-path="${esc(`${base}.summary`)}">${esc(page.summary || '')}</textarea>`)}
    </section>`;
}

function renderBlocks(state, path, blocks) {
  const list = blocks || [];
  return `
    ${list.map((block, index) => renderBlock(state, path, block, index, list.length)).join('')}
    <div class="inline-row">
      <select aria-label="Tipo de bloque">${BLOCK_LABELS.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}</select>
      <button type="button" class="ghost mini" data-action="add-block" data-path="${esc(path)}">Agregar bloque</button>
    </div>`;
}

function renderBlock(state, path, block, index, length) {
  const itemPath = `${path}.${index}`;
  return `
    <article class="repeat">
      <header>
        <strong>${esc(blockLabel(block))}</strong>
        <span class="row-actions">${moveButtons(path, index, length)}</span>
      </header>
      ${BLOCKS.has(block?.type) ? field('Tipo', `<select data-action="block-type" data-list="${esc(path)}" data-index="${index}">${BLOCK_LABELS.map(([value, label]) => `<option value="${esc(value)}" ${value === block.type ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`) : '<p class="hint">Bloque con un tipo que el editor no arma campo por campo. Se edita el JSON para no perderlo.</p>'}
      ${blockBody(state, itemPath, block)}
    </article>`;
}

const BLOCKS = new Set(BLOCK_LABELS.map(([type]) => type));

function blockBody(state, path, block) {
  if (!BLOCKS.has(block?.type)) {
    return field('JSON', `<textarea class="code-input" spellcheck="false" data-kind="json" data-path="${esc(path)}">${esc(jsonValue(state, path, block))}</textarea>${jsonError(state, path)}`);
  }
  if (block.type === 'h2' || block.type === 'h3' || block.type === 'p') {
    return field('Texto', `<textarea data-path="${esc(`${path}.text`)}">${esc(block.text || '')}</textarea>`);
  }
  if (block.type === 'ul' || block.type === 'ol') return stringList(`${path}.items`, block.items, 'Agregar ítem');
  if (block.type === 'callout') {
    return `
      <div class="grid">
        ${field('Tono', select(`${path}.tone`, block.tone || 'note', TONE_OPTIONS))}
        ${field('Título', `<input data-path="${esc(`${path}.title`)}" value="${esc(block.title || '')}" />`)}
      </div>
      ${field('Texto', `<textarea data-path="${esc(`${path}.text`)}">${esc(block.text || '')}</textarea>`)}`;
  }
  if (block.type === 'code') {
    return `
      <div class="grid">
        ${field('Título', `<input data-path="${esc(`${path}.title`)}" value="${esc(block.title || '')}" />`)}
        ${field('Lenguaje', select(`${path}.lang`, block.lang || 'bash', withCurrent(LANG_OPTIONS, block.lang)))}
      </div>
      ${field('Código', `<textarea class="code-input" spellcheck="false" data-path="${esc(`${path}.code`)}">${esc(block.code || '')}</textarea>`)}`;
  }
  if (block.type === 'cards') return renderCards(`${path}.items`, block.items);
  if (block.type === 'errorCodes') {
    const groups = state.working.errorCodes?.groups || [];
    const options = groups.map((group) => [group.id, group.title || group.id]);
    return field('Grupo', select(`${path}.group`, block.group, withCurrent(options, block.group)));
  }
  return renderTable(path, block);
}

function renderTable(path, block) {
  const headers = block.headers || [];
  const rows = block.rows || [];
  return `
    <div class="table-edit">
      <div class="inline-row">
        ${headers.map((header, index) => `
          <label class="grow"><span class="hint">Columna ${index + 1}</span><input data-path="${esc(`${path}.headers.${index}`)}" value="${esc(header)}" />
          <button type="button" class="mini danger" data-action="remove-col" data-path="${esc(path)}" data-index="${index}" ${headers.length <= 1 ? 'disabled' : ''}>Quitar</button></label>`).join('')}
        <button type="button" class="mini" data-action="add-col" data-path="${esc(path)}">Agregar columna</button>
      </div>
      ${rows.map((row, rowIndex) => `
        <div class="inline-row">
          ${headers.map((_, cellIndex) => `<input data-path="${esc(`${path}.rows.${rowIndex}.${cellIndex}`)}" value="${esc(row?.[cellIndex] || '')}" aria-label="Fila ${rowIndex + 1}, columna ${cellIndex + 1}" />`).join('')}
          ${moveButtons(`${path}.rows`, rowIndex, rows.length)}
        </div>`).join('')}
      <button type="button" class="ghost mini" data-action="add-row" data-path="${esc(path)}">Agregar fila</button>
    </div>`;
}

function renderCards(path, items) {
  const list = items || [];
  return `
    ${list.map((card, index) => `
      <article class="repeat">
        <header><strong>${esc(card.title || 'Tarjeta')}</strong><span class="row-actions">${moveButtons(path, index, list.length)}</span></header>
        <div class="grid">
          ${field('Página de destino', `<input data-path="${esc(`${path}.${index}.id`)}" value="${esc(card.id || '')}" spellcheck="false" />`)}
          ${field('Título', `<input data-path="${esc(`${path}.${index}.title`)}" value="${esc(card.title || '')}" />`)}
        </div>
        ${field('Texto', `<input data-path="${esc(`${path}.${index}.text`)}" value="${esc(card.text || '')}" />`)}
      </article>`).join('')}
    ${addButton(path, 'card', 'Agregar tarjeta')}`;
}

function renderParameters(path, parameters) {
  const list = parameters || [];
  return `
    ${list.map((parameter, index) => `
      <article class="repeat">
        <header><strong>${esc(parameter.name || 'Campo nuevo')}</strong><span class="row-actions">${moveButtons(path, index, list.length)}</span></header>
        <div class="grid">
          ${field('Nombre', `<input data-path="${esc(`${path}.${index}.name`)}" value="${esc(parameter.name || '')}" spellcheck="false" />`)}
          ${field('Ubicación', select(`${path}.${index}.in`, parameter.in || 'body', withCurrent(IN_OPTIONS, parameter.in)))}
          ${field('Tipo', `<input data-path="${esc(`${path}.${index}.type`)}" value="${esc(parameter.type || '')}" spellcheck="false" />`)}
          ${field('Obligatorio', select(`${path}.${index}.required`, parameter.required || 'no', withCurrent(REQUIRED_OPTIONS, parameter.required)))}
        </div>
        ${field('Descripción', `<textarea data-path="${esc(`${path}.${index}.description`)}">${esc(parameter.description || '')}</textarea>`)}
      </article>`).join('')}
    ${addButton(path, 'parameter', 'Agregar campo')}`;
}

function renderHeaders(path, headers) {
  const list = headers || [];
  return `
    ${list.map((header, index) => `
      <article class="repeat">
        <header><strong>${esc(header.name || 'Header')}</strong><span class="row-actions">${moveButtons(path, index, list.length)}</span></header>
        <div class="grid">
          ${field('Nombre', `<input data-path="${esc(`${path}.${index}.name`)}" value="${esc(header.name || '')}" spellcheck="false" />`)}
          <div class="field"><span>Obligatorio</span>${check(`${path}.${index}.required`, header.required, 'Sí, hay que enviarlo')}</div>
        </div>
        ${field('Descripción', `<textarea data-path="${esc(`${path}.${index}.description`)}">${esc(header.description || '')}</textarea>`)}
      </article>`).join('')}
    ${addButton(path, 'header', 'Agregar header')}`;
}

function renderNotes(path, notes) {
  const list = notes || [];
  return `
    ${list.map((note, index) => `
      <article class="repeat">
        <header><strong>${esc(note.title || 'Nota')}</strong><span class="row-actions">${moveButtons(path, index, list.length)}</span></header>
        <div class="grid">
          ${field('Tono', select(`${path}.${index}.tone`, note.tone || 'note', TONE_OPTIONS))}
          ${field('Título', `<input data-path="${esc(`${path}.${index}.title`)}" value="${esc(note.title || '')}" />`)}
        </div>
        ${field('Texto', `<textarea data-path="${esc(`${path}.${index}.text`)}">${esc(note.text || '')}</textarea>`)}
      </article>`).join('')}
    ${addButton(path, 'note', 'Agregar nota')}`;
}

function renderGroups(page) {
  const path = `pages.${page.id}.groups`;
  const list = page.groups || [];
  return `
    ${list.map((group, index) => `
      <article class="repeat">
        <header><strong>${esc(group.title || 'Grupo')}</strong><span class="row-actions">${moveButtons(path, index, list.length)}</span></header>
        ${field('Título', `<input data-path="${esc(`${path}.${index}.title`)}" value="${esc(group.title || '')}" />`)}
        ${field('Descripción', `<textarea data-path="${esc(`${path}.${index}.description`)}">${esc(group.description || '')}</textarea>`)}
        ${renderParameters(`${path}.${index}.parameters`, group.parameters)}
      </article>`).join('')}
    ${addButton(path, 'group', 'Agregar grupo')}`;
}

function renderHttpErrors(page) {
  const path = `pages.${page.id}.errors`;
  const list = page.errors || [];
  return `
    ${list.map((error, index) => `
      <article class="repeat">
        <header><strong>${esc(error.situation || 'Error')}</strong><span class="row-actions">${moveButtons(path, index, list.length)}</span></header>
        <div class="grid">
          ${field('Situación', `<input data-path="${esc(`${path}.${index}.situation`)}" value="${esc(error.situation || '')}" />`)}
          ${field('HTTP', `<input data-path="${esc(`${path}.${index}.http`)}" value="${esc(error.http ?? '')}" />`)}
        </div>
        ${field('Cuerpo', `<textarea data-path="${esc(`${path}.${index}.body`)}">${esc(error.body || '')}</textarea>`)}
      </article>`).join('')}
    ${addButton(path, 'error', 'Agregar error')}`;
}

function renderResponses(state, page) {
  const path = `pages.${page.id}.responses`;
  const list = page.responses || [];
  return `
    ${list.map((sample, index) => {
      const bodyPath = `${path}.${index}.body`;
      return `
        <article class="repeat">
          <header><strong>${esc(sample.title || 'Respuesta')}</strong><span class="row-actions">${moveButtons(path, index, list.length)}</span></header>
          ${field('Título', `<input data-path="${esc(`${path}.${index}.title`)}" value="${esc(sample.title || '')}" />`)}
          ${field('Cuerpo JSON', `<textarea class="code-input" spellcheck="false" data-kind="json" data-path="${esc(bodyPath)}">${esc(jsonValue(state, bodyPath, sample.body))}</textarea>${jsonError(state, bodyPath)}`, 'Objeto, array, número o un texto entre comillas.')}
        </article>`;
    }).join('')}
    ${addButton(path, 'response', 'Agregar respuesta')}`;
}

function renderConfirm(confirm) {
  return `
    <div class="backdrop" data-action="confirm-cancel"></div>
    <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title">${esc(confirm.title)}</h2>
      <p>${esc(confirm.text)}</p>
      <div class="drawer-actions">
        <button type="button" class="ghost" data-action="confirm-cancel">Cancelar</button>
        <button type="button" class="${confirm.danger ? 'primary danger-fill' : 'primary'}" data-action="confirm-ok">${esc(confirm.confirmLabel || 'Confirmar')}</button>
      </div>
    </div>`;
}

function summaryList(summary) {
  const bits = [];
  if (summary.added.length) bits.push(`Entran: ${summary.added.join(', ')}.`);
  if (summary.removed.length) bits.push(`Salen: ${summary.removed.join(', ')}.`);
  if (summary.changed.length) bits.push(`Cambian: ${summary.changed.join(', ')}.`);
  if (summary.catalog) bits.push('Cambia el menú.');
  if (summary.site) bits.push('Cambia el sitio o los valores ilustrativos.');
  if (summary.errorCodes) bits.push('Cambian los códigos de error.');
  if (!bits.length) bits.push('El archivo es igual al borrador actual.');
  return `<ul class="plain-list">${bits.map((bit) => `<li>${esc(bit)}</li>`).join('')}</ul>`;
}

function findItem(state, id) {
  for (const category of state.working.catalog.categories) {
    const item = category.items.find((entry) => entry.id === id);
    if (item) return { category, item };
  }
  return null;
}

function pageLink(item, page, active) {
  const method = item.type === 'guide' ? 'guide' : String(page?.method || 'post').toLowerCase();
  const badge = item.type === 'guide' ? 'Guía' : (page?.method || 'API');
  const label = page?.nav || page?.title || item.id;
  return `<a class="${active ? 'active' : ''}" href="#page/${esc(item.id)}" data-nav-page="${esc(item.id)}"><span class="method ${esc(method)}">${esc(badge)}</span><span>${esc(label)}</span></a>`;
}

function topLink(href, label, active) {
  return `<a class="top-link ${active ? 'active' : ''}" href="${esc(href)}">${esc(label)}</a>`;
}

function field(label, control, hint = '') {
  return `<label class="field"><span>${esc(label)}</span>${control}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>`;
}

function select(path, value, options, extra = '') {
  const current = value == null ? '' : String(value);
  return `<select data-path="${esc(path)}" ${extra}>${options.map(([option, label]) => `<option value="${esc(option)}" ${String(option) === current ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
}

function check(path, checked, label) {
  return `<label class="check"><input type="checkbox" data-path="${esc(path)}" data-kind="boolean" ${checked ? 'checked' : ''} /> ${esc(label)}</label>`;
}

function stringList(path, items, addLabel) {
  const list = items || [];
  return `
    ${list.map((item, index) => `
      <div class="inline-row">
        <textarea data-path="${esc(`${path}.${index}`)}">${esc(item)}</textarea>
        ${moveButtons(path, index, list.length)}
      </div>`).join('')}
    <button type="button" class="ghost mini" data-action="add-string" data-path="${esc(path)}">${esc(addLabel)}</button>`;
}

function addButton(path, template, label) {
  return `<button type="button" class="ghost mini" data-action="add-object" data-path="${esc(path)}" data-template="${esc(template)}">${esc(label)}</button>`;
}

function orderButtons(path, index, length) {
  return `
    <button type="button" class="mini icon" data-action="move" data-path="${esc(path)}" data-index="${index}" data-delta="-1" ${index === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
    <button type="button" class="mini icon" data-action="move" data-path="${esc(path)}" data-index="${index}" data-delta="1" ${index === length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>`;
}

function moveButtons(path, index, length) {
  return `${orderButtons(path, index, length)}<button type="button" class="mini danger" data-action="remove" data-path="${esc(path)}" data-index="${index}">Quitar</button>`;
}

function jsonValue(state, path, value) {
  if (state.jsonBuffers?.has(path)) return state.jsonBuffers.get(path);
  if (value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

function jsonError(state, path) {
  const message = state.jsonErrors?.get(path);
  return message ? `<span class="field-error">${esc(message)}</span>` : '';
}

function withCurrent(options, value) {
  if (value && !options.some(([option]) => option === value)) return [...options, [value, String(value)]];
  return options;
}

function blockLabel(block) {
  return BLOCK_LABELS.find(([type]) => type === block?.type)?.[1] || block?.type || 'Bloque';
}

function exampleEnv(site) {
  const defaults = { baseUrl: site?.baseUrl || '', ...(site?.placeholders || {}) };
  return { defaults, values: { ...defaults } };
}

function previewHref(state, id) {
  return `./index.html${state.dirty ? '?preview=draft' : ''}#/${id || 'empezar'}`;
}

function bannerText(state) {
  if (state.dirty) {
    const when = state.draftSavedAt ? ` Último guardado en este navegador: ${formatWhen(state.draftSavedAt)}.` : '';
    return `Este borrador está solo en este navegador.${when} La documentación pública no cambia hasta que exportes los JSON y los publiques.`;
  }
  return 'Estás viendo el contenido publicado. Si editás, el cambio queda en este navegador y no se publica solo.';
}

function reportSummary(errors, warnings) {
  if (errors.length) return `${errors.length} ${errors.length === 1 ? 'error' : 'errores'} de validación`;
  if (warnings.length) return `${warnings.length} ${warnings.length === 1 ? 'advertencia' : 'advertencias'}`;
  return 'Validación sin errores';
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
