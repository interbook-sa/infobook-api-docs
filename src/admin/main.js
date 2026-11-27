import '../styles.css';
import './admin.css';
import { cloneBundle, diffBundles, fingerprint, loadPublished } from '../content/bundle.js';
import { VERIFIED_ROUTES } from '../content/contracts.js';
import { clearDraft, pushBackup, readBackups, readDraft, writeDraft } from '../content/draft.js';
import { ID_RE, PLACEHOLDER_KEY_RE, slugify } from '../content/ids.js';
import { validateBundle } from '../content/validate.js';
import { esc } from '../format.js';
import { downloadBundle, downloadPage, parseImportFiles, writeBundleToDirectory } from './io.js';
import { renderApp, renderCurl, reportBody } from './render.js';
import {
  BLOCK_TEMPLATES,
  OBJECT_TEMPLATES,
  ensureArray,
  getPath,
  moveItem,
  removeItem,
  setPath
} from './templates.js';

const KNOWN_PLACEHOLDERS = new Set(['username', 'password', 'token', 'serviceCode', 'deliveryNumber', 'trackingCode']);

const state = {
  published: null,
  working: null,
  selection: { kind: 'site' },
  dirty: false,
  draftSavedAt: null,
  report: { errors: [], warnings: [] },
  jsonBuffers: new Map(),
  jsonErrors: new Map(),
  importPreview: null,
  confirm: null,
  notice: '',
  saveError: '',
  formError: null,
  backups: [],
  canPickDirectory: false
};

const app = document.querySelector('#app');
boot();

async function boot() {
  app.innerHTML = '<main class="loading">Cargando el panel…</main>';
  try {
    state.canPickDirectory = typeof window.showDirectoryPicker === 'function';
    state.published = cloneBundle(await loadPublished({ fresh: true }));
    const stored = readDraft();
    state.working = stored?.corrupt
      ? cloneBundle(state.published)
      : stored?.bundle
        ? cloneBundle(stored.bundle)
        : cloneBundle(state.published);
    if (stored?.corrupt) state.notice = 'Había un borrador ilegible en este navegador y no se usó.';
    if (!state.working.catalog?.categories) state.working.catalog = { categories: [] };
    if (!state.working.errorCodes?.groups) state.working.errorCodes = { groups: state.working.errorCodes?.groups || [] };
    if (!state.working.site.placeholders) state.working.site.placeholders = {};
    if (!state.working.pages) state.working.pages = {};
    state.dirty = fingerprint(state.working) !== fingerprint(state.published);
    if (!state.dirty) clearDraft();
    else if (stored?.bundle) {
      state.draftSavedAt = stored.updatedAt || null;
      state.notice = 'Se recuperó un borrador de este navegador. La documentación publicada no incluye estos cambios.';
    }
    state.report = validateBundle(state.working);
    state.selection = selectionFromHash();
    document.addEventListener('input', (event) => applyValue(event.target));
    document.addEventListener('change', onChange);
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('hashchange', () => {
      state.formError = null;
      state.selection = selectionFromHash();
      paint();
    });
    window.addEventListener('beforeunload', (event) => {
      if (state.saveError) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    if (!location.hash) history.replaceState(null, '', '#site');
    paint();
  } catch (error) {
    app.innerHTML = `<main class="error-page"><h1>No se pudo abrir el panel</h1><p>${esc(error.message)}</p></main>`;
  }
}

function selectionFromHash() {
  const [kind, id] = location.hash.replace(/^#/, '').split('/');
  if (kind === 'page' && id && state.working?.pages?.[id]) return { kind: 'page', id };
  if (kind === 'category' && state.working?.catalog?.categories?.some((category) => category.id === id)) {
    return { kind: 'category', id };
  }
  if (kind === 'errors' || kind === 'io' || kind === 'site') return { kind };
  return { kind: 'site' };
}

function paint() {
  const mainScroll = document.querySelector('.admin-main')?.scrollTop || 0;
  const navScroll = document.querySelector('.admin-nav')?.scrollTop || 0;
  state.backups = readBackups();
  app.innerHTML = renderApp(state);
  const main = document.querySelector('.admin-main');
  const nav = document.querySelector('.admin-nav');
  if (main) main.scrollTop = mainScroll;
  if (nav) nav.scrollTop = navScroll;
}

function persist() {
  state.dirty = fingerprint(state.working) !== fingerprint(state.published);
  if (!state.dirty) {
    clearDraft();
    state.saveError = '';
    state.draftSavedAt = null;
  } else {
    const result = writeDraft(state.working);
    state.saveError = result.ok ? '' : result.message;
    if (result.ok) state.draftSavedAt = new Date().toISOString();
  }
  state.report = validateBundle(state.working);
  updateChrome();
}

function commit() {
  state.jsonBuffers.clear();
  state.jsonErrors.clear();
  persist();
  paint();
}

function go(hash) {
  if (location.hash === hash) {
    state.selection = selectionFromHash();
    paint();
  } else {
    location.hash = hash;
  }
}

function updateChrome() {
  const status = document.querySelector('[data-chrome="status"]');
  if (status) {
    status.textContent = state.dirty ? 'Borrador local' : 'Igual a lo publicado';
    status.classList.toggle('is-dirty', state.dirty);
  }
  const banner = document.querySelector('[data-chrome="banner"]');
  if (banner) {
    banner.textContent = state.dirty
      ? `Este borrador está solo en este navegador.${state.draftSavedAt ? ` Último guardado en este navegador: ${formatWhen(state.draftSavedAt)}.` : ''} La documentación pública no cambia hasta que exportes los JSON y los publiques.`
      : 'Estás viendo el contenido publicado. Si editás, el cambio queda en este navegador y no se publica solo.';
    banner.classList.toggle('is-dirty', state.dirty);
  }
  const count = document.querySelector('[data-chrome="count"]');
  if (count) count.textContent = reportSummary(state.report);
  const report = document.querySelector('[data-chrome="report"]');
  if (report) report.innerHTML = reportBody(state.report.errors, state.report.warnings);
  const details = document.querySelector('.admin-main .report');
  if (details && state.report.errors.length) details.open = true;
  const discard = document.querySelector('[data-chrome="discard"]');
  if (discard) discard.hidden = !state.dirty;
  const preview = document.querySelector('[data-chrome="preview"]');
  if (preview) {
    const id = state.selection.kind === 'page' ? state.selection.id : 'empezar';
    preview.href = `./index.html${state.dirty ? '?preview=draft' : ''}#/${id}`;
  }
}

function applyValue(el) {
  if (!(el instanceof HTMLElement) || !el.dataset.path || el.dataset.locked || el.dataset.action) return;
  const path = el.dataset.path;
  if (el.dataset.kind === 'json') {
    try {
      setPath(state.working, path, JSON.parse(el.value));
      state.jsonBuffers.delete(path);
      state.jsonErrors.delete(path);
      showJsonError(el, '');
    } catch {
      const message = 'Este texto no es JSON válido. Se mantiene el último valor correcto.';
      state.jsonBuffers.set(path, el.value);
      state.jsonErrors.set(path, message);
      showJsonError(el, message);
      return;
    }
  } else if (el.dataset.kind === 'boolean') {
    setPath(state.working, path, el.checked);
  } else if (el.dataset.kind === 'number') {
    const raw = el.value.trim();
    setPath(state.working, path, raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw);
  } else {
    setPath(state.working, path, el.value);
  }
  persist();
  refreshNavLabel(path);
  refreshCurl();
}

function onChange(event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.matches('[data-import]')) {
    importFiles(el.files);
    el.value = '';
    return;
  }
  if (el.dataset.renamePage) {
    renamePage(el);
    return;
  }
  if (el.dataset.renameCategory != null && el.dataset.renameCategory !== '') {
    renameCategory(el);
    return;
  }
  if (el.dataset.action === 'block-type') {
    changeBlockType(el);
    return;
  }
  if (el.dataset.action === 'move-page') {
    movePage(el);
    return;
  }
  applyValue(el);
}

function onClick(event) {
  const btn = event.target instanceof Element ? event.target.closest('[data-action]') : null;
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'confirm-cancel') {
    state.confirm = null;
    paint();
    return;
  }
  if (action === 'confirm-ok') {
    const run = state.confirm?.run;
    state.confirm = null;
    paint();
    run?.();
    return;
  }
  if (action === 'dismiss-notice') {
    state.notice = '';
    paint();
    return;
  }
  if (action === 'download') requestDownload();
  else if (action === 'save-dir') requestDirectory();
  else if (action === 'discard') discard();
  else if (action === 'reload-published') reloadPublished();
  else if (action === 'add-category') addCategory();
  else if (action === 'delete-category') deleteCategory(btn.dataset.id);
  else if (action === 'delete-page') deletePage(btn.dataset.id);
  else if (action === 'download-page') downloadPage(state.working.pages[btn.dataset.id]);
  else if (action === 'copy-text') copyText(btn);
  else if (action === 'apply-import') applyImport();
  else if (action === 'cancel-import') {
    state.importPreview = null;
    paint();
  } else if (action === 'restore-backup') restoreBackup(btn.dataset.id);
  else if (action === 'remove-placeholder') removePlaceholder(btn.dataset.key);
  else if (action === 'move') {
    moveItem(getPath(state.working, btn.dataset.path), Number(btn.dataset.index), Number(btn.dataset.delta));
    commit();
  } else if (action === 'remove') {
    removeItem(getPath(state.working, btn.dataset.path), Number(btn.dataset.index));
    commit();
  } else if (action === 'add-string') {
    ensureArray(state.working, btn.dataset.path)?.push('');
    commit();
  } else if (action === 'add-object') {
    const list = ensureArray(state.working, btn.dataset.path);
    const template = OBJECT_TEMPLATES[btn.dataset.template];
    if (list && template) list.push(structuredClone(template));
    commit();
  } else if (action === 'add-block') addBlock(btn);
  else if (action === 'add-col') addColumn(btn.dataset.path);
  else if (action === 'remove-col') removeColumn(btn.dataset.path, Number(btn.dataset.index));
  else if (action === 'add-row') addRow(btn.dataset.path);
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.hasAttribute('data-create-page')) {
    event.preventDefault();
    createPage(form);
  } else if (form.hasAttribute('data-add-placeholder')) {
    event.preventDefault();
    addPlaceholder(form);
  }
}

function createPage(form) {
  const category = state.working.catalog.categories[Number(form.dataset.createPage)];
  if (!category) return;
  const type = form.querySelector('[name="type"]').value === 'guide' ? 'guide' : 'endpoint';
  const title = form.querySelector('[name="title"]').value.trim();
  const typedId = form.querySelector('[name="id"]').value;
  const id = slugify(typedId || title);
  const fail = (message) => {
    state.formError = { categoryId: category.id, message, draft: { type, id: typedId, title } };
    paint();
  };
  if (!title) {
    fail('El título es obligatorio.');
    return;
  }
  if (!ID_RE.test(id)) {
    fail('El identificador usa minúsculas y guiones. Por ejemplo: estado-pedido.');
    return;
  }
  if (state.working.pages[id]) {
    fail('Ese identificador ya existe.');
    return;
  }
  state.formError = null;
  state.working.pages[id] = type === 'guide' ? blankGuide(id, title) : blankEndpoint(id, title);
  category.items.push({ type, id });
  persist();
  go(`#page/${id}`);
}

function blankEndpoint(id, title) {
  return {
    id,
    title,
    nav: title,
    summary: '',
    method: 'POST',
    path: '/api/wms/',
    auth: 'required',
    source: '',
    purpose: [],
    headers: [
      { name: 'Authorization', required: true, description: '`Bearer <token>`.' },
      { name: 'Content-Type', required: true, description: '`application/json`.' }
    ],
    parameters: [],
    request: {},
    responses: [{ title: 'HTTP 200', body: {} }],
    errors: [],
    considerations: []
  };
}

function blankGuide(id, title) {
  return {
    id,
    title,
    nav: title,
    summary: '',
    blocks: [{ type: 'p', text: '' }]
  };
}

function addCategory() {
  const ids = new Set(state.working.catalog.categories.map((category) => category.id));
  let id = 'seccion';
  let n = 2;
  while (ids.has(id)) {
    id = `seccion-${n}`;
    n += 1;
  }
  state.working.catalog.categories.push({ id, title: 'Nueva sección', items: [] });
  persist();
  go(`#category/${id}`);
}

function deleteCategory(id) {
  const category = state.working.catalog.categories.find((item) => item.id === id);
  if (!category) return;
  const locked = category.items.filter((item) => VERIFIED_ROUTES[item.id]).map((item) => item.id);
  if (locked.length) {
    state.notice = `No se puede eliminar la sección porque incluye operaciones del contrato verificado: ${locked.join(', ')}.`;
    paint();
    return;
  }
  askConfirm({
    title: 'Eliminar sección',
    text: category.items.length
      ? `Se quita "${category.title}" y sus páginas del borrador local. Lo publicado no cambia.`
      : `Se quita la sección "${category.title}" del borrador local. Lo publicado no cambia.`,
    confirmLabel: 'Eliminar',
    danger: true,
    run() {
      for (const item of category.items) delete state.working.pages[item.id];
      state.working.catalog.categories = state.working.catalog.categories.filter((item) => item.id !== id);
      persist();
      state.notice = 'La sección salió del borrador local.';
      go('#site');
    }
  });
}

function deletePage(id) {
  if (VERIFIED_ROUTES[id]) {
    state.notice = 'Esta operación pertenece al contrato verificado. Se puede editar el texto, no eliminarla.';
    paint();
    return;
  }
  const page = state.working.pages[id];
  askConfirm({
    title: 'Eliminar página',
    text: `Se quita "${page?.title || id}" del borrador local. Lo publicado no cambia.`,
    confirmLabel: 'Eliminar',
    danger: true,
    run() {
      delete state.working.pages[id];
      for (const category of state.working.catalog.categories) {
        category.items = category.items.filter((item) => item.id !== id);
      }
      persist();
      state.notice = 'La página salió del borrador local.';
      go('#site');
    }
  });
}

function renamePage(input) {
  if (input.dataset.locked) return;
  const oldId = input.dataset.renamePage;
  const next = slugify(input.value);
  if (!next || next === oldId) {
    input.value = oldId;
    return;
  }
  if (!ID_RE.test(next) || state.working.pages[next] || VERIFIED_ROUTES[oldId]) {
    state.notice = 'Ese identificador no está disponible. Usá minúsculas y guiones, sin repetir.';
    input.value = oldId;
    paint();
    return;
  }
  const page = state.working.pages[oldId];
  page.id = next;
  state.working.pages[next] = page;
  delete state.working.pages[oldId];
  for (const category of state.working.catalog.categories) {
    for (const item of category.items) {
      if (item.id === oldId) item.id = next;
    }
  }
  state.jsonBuffers.clear();
  state.jsonErrors.clear();
  persist();
  go(`#page/${next}`);
}

function renameCategory(input) {
  const index = Number(input.dataset.renameCategory);
  const category = state.working.catalog.categories[index];
  if (!category) return;
  const next = slugify(input.value);
  const taken = state.working.catalog.categories.some((item, itemIndex) => item.id === next && itemIndex !== index);
  if (!next || !ID_RE.test(next) || taken) {
    state.notice = 'Ese id de sección no está disponible.';
    input.value = category.id;
    paint();
    return;
  }
  category.id = next;
  persist();
  go(`#category/${next}`);
}

function movePage(el) {
  const id = el.dataset.id;
  const targetId = el.value;
  let moved = null;
  for (const category of state.working.catalog.categories) {
    const index = category.items.findIndex((item) => item.id === id);
    if (index < 0) continue;
    if (category.id === targetId) return;
    moved = category.items.splice(index, 1)[0];
    break;
  }
  const target = state.working.catalog.categories.find((category) => category.id === targetId);
  if (moved && target) target.items.push(moved);
  commit();
}

function changeBlockType(el) {
  const list = getPath(state.working, el.dataset.list);
  const index = Number(el.dataset.index);
  const current = list?.[index];
  const next = BLOCK_TEMPLATES[el.value];
  if (!current || !next) return;
  const block = structuredClone(next);
  if (typeof current.text === 'string' && Object.prototype.hasOwnProperty.call(block, 'text')) block.text = current.text;
  if (typeof current.title === 'string' && Object.prototype.hasOwnProperty.call(block, 'title')) block.title = current.title;
  if (typeof current.code === 'string' && Object.prototype.hasOwnProperty.call(block, 'code')) block.code = current.code;
  if ((block.type === 'ul' || block.type === 'ol') && Array.isArray(current.items) && current.items.every((item) => typeof item === 'string')) {
    block.items = [...current.items];
  }
  list[index] = block;
  commit();
}

function addBlock(btn) {
  const type = btn.previousElementSibling?.value || 'p';
  const list = ensureArray(state.working, btn.dataset.path);
  if (!list || !BLOCK_TEMPLATES[type]) return;
  list.push(structuredClone(BLOCK_TEMPLATES[type]));
  commit();
}

function addColumn(path) {
  const block = getPath(state.working, path);
  if (!Array.isArray(block?.headers)) return;
  block.headers.push('Columna');
  if (!Array.isArray(block.rows)) block.rows = [];
  for (const row of block.rows) row.push('');
  commit();
}

function removeColumn(path, index) {
  const block = getPath(state.working, path);
  if (!Array.isArray(block?.headers) || block.headers.length <= 1) return;
  block.headers.splice(index, 1);
  for (const row of block.rows || []) row.splice(index, 1);
  commit();
}

function addRow(path) {
  const block = getPath(state.working, path);
  if (!Array.isArray(block?.headers)) return;
  if (!Array.isArray(block.rows)) block.rows = [];
  block.rows.push(block.headers.map(() => ''));
  commit();
}

function addPlaceholder(form) {
  const key = form.querySelector('[name="key"]').value.trim();
  const value = form.querySelector('[name="value"]').value;
  if (!PLACEHOLDER_KEY_RE.test(key) || key === 'baseUrl') {
    state.notice = 'El identificador usa letras y números, y empieza con una letra. Por ejemplo: warehouse.';
    paint();
    return;
  }
  if (Object.prototype.hasOwnProperty.call(state.working.site.placeholders, key)) {
    state.notice = 'Ese identificador ya existe.';
    paint();
    return;
  }
  state.working.site.placeholders[key] = value;
  commit();
}

function removePlaceholder(key) {
  const run = () => {
    delete state.working.site.placeholders[key];
    commit();
  };
  if (!KNOWN_PLACEHOLDERS.has(key)) {
    run();
    return;
  }
  askConfirm({
    title: 'Quitar valor ilustrativo',
    text: `Los ejemplos usan {{${key}}}. Si lo quitás, ese reemplazo deja de tener valor en el borrador.`,
    confirmLabel: 'Quitar',
    danger: true,
    run
  });
}

function requestDownload() {
  if (!state.report.errors.length) {
    downloadBundle(state.working);
    return;
  }
  askConfirm({
    title: 'Hay errores de validación',
    text: `Podés exportar igual. Conviene corregirlos antes de publicar.\n\n${state.report.errors.slice(0, 8).join('\n')}`,
    confirmLabel: 'Exportar igual',
    danger: true,
    run() { downloadBundle(state.working); }
  });
}

function requestDirectory() {
  if (!state.report.errors.length) {
    saveDirectory();
    return;
  }
  askConfirm({
    title: 'Hay errores de validación',
    text: `Podés escribir los archivos igual. Conviene corregirlos antes de publicarlos.\n\n${state.report.errors.slice(0, 8).join('\n')}`,
    confirmLabel: 'Escribir igual',
    danger: true,
    run() { saveDirectory(); }
  });
}

async function saveDirectory() {
  try {
    const result = await writeBundleToDirectory(state.working);
    const fresh = cloneBundle(await loadPublished({ fresh: true }));
    const served = fingerprint(fresh) === fingerprint(state.working);
    if (served) state.published = fresh;
    persist();
    const leftover = result.leftover.length ? ` Siguen en la carpeta, fuera del menú: ${result.leftover.join(', ')}.` : '';
    state.notice = served
      ? `Se escribieron los archivos y este sitio ya los sirve. Quedaron como publicados.${leftover}`
      : `Se escribieron los archivos en la carpeta elegida. El sitio público no cambia hasta que esa carpeta sea la que se publica.${leftover}`;
    paint();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    state.notice = error.message || 'No se pudo escribir la carpeta.';
    paint();
  }
}

async function reloadPublished() {
  try {
    state.published = cloneBundle(await loadPublished({ fresh: true }));
    persist();
    state.notice = state.dirty
      ? 'Se releyeron los JSON publicados. El borrador local sigue distinto.'
      : 'Se releyeron los JSON publicados. Coinciden con lo que estás viendo.';
    paint();
  } catch (error) {
    state.notice = error.message;
    paint();
  }
}

async function importFiles(fileList) {
  try {
    const bundle = await parseImportFiles(fileList);
    state.importPreview = {
      bundle,
      report: validateBundle(bundle),
      summary: diffBundles(state.working, bundle)
    };
  } catch (error) {
    state.importPreview = { error: error.message || 'No se pudo leer el archivo.' };
  }
  go('#io');
}

function applyImport() {
  const preview = state.importPreview;
  if (!preview?.bundle || preview.report?.errors?.length) return;
  askConfirm({
    title: 'Reemplazar el borrador',
    text: 'Se guarda una copia del borrador actual y después se reemplaza por el archivo. Lo publicado no cambia.',
    confirmLabel: 'Aplicar importación',
    danger: true,
    run() {
      const saved = pushBackup(state.working, 'Antes de importar');
      state.working = cloneBundle(preview.bundle);
      state.importPreview = null;
      state.jsonBuffers.clear();
      state.jsonErrors.clear();
      persist();
      state.notice = saved.ok
        ? 'Importación aplicada al borrador de este navegador. Lo publicado no cambió.'
        : 'Importación aplicada. No se pudo guardar la copia anterior.';
      paint();
    }
  });
}

function restoreBackup(id) {
  const backup = readBackups().find((item) => item.id === id);
  if (!backup?.bundle) return;
  askConfirm({
    title: 'Restaurar copia',
    text: 'Reemplaza el borrador actual por esa copia. Antes se guarda el borrador de ahora. Lo publicado no cambia.',
    confirmLabel: 'Restaurar',
    danger: true,
    run() {
      pushBackup(state.working, 'Antes de restaurar una copia');
      state.working = cloneBundle(backup.bundle);
      state.jsonBuffers.clear();
      state.jsonErrors.clear();
      persist();
      state.notice = 'Se restauró la copia en el borrador local.';
      paint();
    }
  });
}

function discard() {
  if (!state.dirty) return;
  askConfirm({
    title: 'Descartar el borrador',
    text: 'Se vuelve al contenido publicado. Antes se guarda una copia en este navegador.',
    confirmLabel: 'Descartar',
    danger: true,
    run() {
      const saved = pushBackup(state.working, 'Antes de descartar el borrador');
      state.working = cloneBundle(state.published);
      state.jsonBuffers.clear();
      state.jsonErrors.clear();
      persist();
      state.notice = saved.ok
        ? 'Se descartó el borrador. La copia quedó en este navegador.'
        : 'Se descartó el borrador. No hubo lugar para guardar la copia.';
      paint();
    }
  });
}

function askConfirm(confirm) {
  state.confirm = confirm;
  paint();
}

function refreshCurl() {
  const node = document.querySelector('[data-live-curl]');
  if (!node || state.selection.kind !== 'page') return;
  const page = state.working.pages[state.selection.id];
  if (!page?.method) return;
  node.innerHTML = renderCurl(page, state.working.site);
}

function refreshNavLabel(path) {
  const pageMatch = path.match(/^pages\.([^.]+)\.(title|nav|method)$/);
  if (pageMatch) {
    const page = state.working.pages[pageMatch[1]];
    const label = document.querySelector(`[data-nav-page="${CSS.escape(pageMatch[1])}"] span:last-child`);
    if (label && page) label.textContent = page.nav || page.title || page.id;
    if (pageMatch[2] === 'method') {
      const badge = document.querySelector(`[data-nav-page="${CSS.escape(pageMatch[1])}"] .method`);
      if (badge && page) {
        badge.textContent = page.method;
        badge.className = `method ${String(page.method || '').toLowerCase()}`;
      }
    }
    return;
  }
  const categoryMatch = path.match(/^catalog\.categories\.(\d+)\.title$/);
  if (!categoryMatch) return;
  const category = state.working.catalog.categories[Number(categoryMatch[1])];
  const node = document.querySelector(`[data-nav-category="${CSS.escape(category.id)}"]`);
  if (node && category) node.textContent = category.title;
}

function showJsonError(el, message) {
  const parent = el.parentElement;
  if (!parent) return;
  let node = parent.querySelector('.field-error');
  if (!message) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement('span');
    node.className = 'field-error';
    el.after(node);
  }
  node.textContent = message;
}

async function copyText(btn) {
  const text = decodeURIComponent(btn.dataset.copy || '');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  const previous = btn.textContent;
  btn.textContent = 'Copiado';
  setTimeout(() => { btn.textContent = previous === 'Copiado' ? 'Copiar' : previous; }, 1400);
}

function reportSummary(report) {
  const errors = report?.errors?.length || 0;
  const warnings = report?.warnings?.length || 0;
  if (errors) return `${errors} ${errors === 1 ? 'error' : 'errores'} de validación`;
  if (warnings) return `${warnings} ${warnings === 1 ? 'advertencia' : 'advertencias'}`;
  return 'Validación sin errores';
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
