import './styles.css';
import { loadPublished } from './content/bundle.js';
import { readDraft } from './content/draft.js';
import { applyPlaceholders, buildCurl } from './curl.js';
import { esc, highlight, pretty, requiredLabel, rich } from './format.js';

const STORAGE = 'interbook-api-docs-env';
const state = {
  site: null,
  catalog: null,
  pages: new Map(),
  errorCodes: null,
  env: null,
  shell: 'bash',
  query: '',
  searchOpen: false,
  activeSearch: 0,
  navOpen: false,
  envOpen: false,
  tab: 'curl'
};

const app = document.querySelector('#app');

boot().catch((error) => {
  app.innerHTML = `<main class="error-page"><h1>No se pudo cargar la documentación</h1><p>${esc(error.message)}</p></main>`;
});

async function boot() {
  app.innerHTML = '<main class="loading">Cargando documentación…</main>';
  const preview = new URLSearchParams(location.search).get('preview') === 'draft';
  let bundle;
  if (preview) {
    const stored = readDraft();
    if (!stored?.bundle) throw new Error('No hay un borrador local en este navegador. Se crea desde Administrar documentación.');
    bundle = stored.bundle;
    state.preview = true;
  } else {
    bundle = await loadPublished();
  }
  state.site = bundle.site;
  state.catalog = bundle.catalog;
  state.errorCodes = bundle.errorCodes;
  state.env = loadEnv(bundle.site);
  for (const category of bundle.catalog.categories || []) {
    for (const item of category.items || []) {
      const page = bundle.pages[item.id];
      if (!page) throw new Error(`Falta la página ${item.id}`);
      state.pages.set(item.id, { ...page, type: item.type, category: category.title });
    }
  }
  window.addEventListener('hashchange', () => {
    state.navOpen = false;
    state.searchOpen = false;
    render();
  });
  document.addEventListener('keydown', onKey);
  if (!location.hash) location.replace('#/empezar');
  render();
}

function loadEnv(site) {
  const defaults = { baseUrl: site.baseUrl, ...site.placeholders };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch { saved = {}; }
  return { defaults, values: { ...defaults, ...saved.values }, shell: saved.shell || 'bash' };
}

function saveEnv() {
  localStorage.setItem(STORAGE, JSON.stringify({ values: state.env.values, shell: state.shell }));
}

function currentId() {
  const id = location.hash.replace(/^#\//, '').split('?')[0];
  return state.pages.has(id) ? id : 'empezar';
}

function onKey(event) {
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    event.preventDefault();
    document.querySelector('.search input')?.focus();
  }
  if (event.key === 'Escape') {
    state.searchOpen = false;
    state.navOpen = false;
    state.envOpen = false;
    render();
  }
}

function render() {
  const id = currentId();
  const page = state.pages.get(id);
  if (!page) {
    app.innerHTML = `<main class="error-page"><h1>No se encontró la página</h1><p>No hay contenido para mostrar.</p></main>`;
    return;
  }
  state.shell = state.env.shell || state.shell;
  const sidebarScroll = document.querySelector('.sidebar')?.scrollTop || 0;
  app.innerHTML = `
    <div class="shell">
      ${header()}
      ${state.preview ? previewBanner() : ''}
      <div class="layout">
        <aside class="sidebar ${state.navOpen ? 'open' : ''}">${nav(id)}</aside>
        <div class="main-col">
          <main class="content">${page.type === 'guide' ? guide(page) : endpoint(page)}</main>
          ${footer()}
        </div>
      </div>
      ${state.navOpen ? '<div class="backdrop nav-backdrop" data-action="close-nav"></div>' : ''}
      ${state.envOpen ? envDrawer() : ''}
    </div>`;
  // El menú tiene scroll propio: se conserva su posición al volver a pintar.
  document.querySelector('.sidebar').scrollTop = sidebarScroll;
  bind();
}

function header() {
  return `
    <header class="top">
      <button class="menu-btn" data-action="nav" aria-label="${state.navOpen ? 'Cerrar' : 'Abrir'} navegación" aria-expanded="${state.navOpen}">
        ${icon(state.navOpen ? 'M18 6L6 18M6 6l12 12' : 'M4 7h16M4 12h16M4 17h16')}
      </button>
      <a class="brand" href="#/empezar" aria-label="${esc(state.site.title)}. Ir a Empezar">
        <img src="./images/interbook-logo-white.png" alt="" width="900" height="137" />
        <span class="brand-label">API para integraciones</span>
      </a>
      <div class="search">
        <input type="search" placeholder="Buscar endpoints, campos o rutas" value="${esc(state.query)}" aria-label="Buscar en la documentación" />
        ${state.searchOpen ? searchResults() : ''}
      </div>
      <button class="env-btn" data-action="env" aria-label="Datos de ejemplo">
        <span class="env-text"><span>Datos de ejemplo</span> · ${esc(shortHost())}</span>
        ${icon('M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M16 4v4M8 10v4M18 16v4', 'env-icon')}
      </button>
    </header>`;
}

function icon(path, className = '') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}" /></svg>`;
}

function previewBanner() {
  return `<div class="preview-banner" role="status">Vista previa del borrador de este navegador. Quien entra al sitio sigue viendo la documentación publicada. <a href="./admin.html">Volver al panel</a></div>`;
}

function footer() {
  return `
    <footer class="footer">
      <p>Interbook · Logística para e&#8209;commerce</p>
      <p><a href="./admin.html">Administrar documentación</a></p>
      <p>© ${new Date().getFullYear()} Interbook</p>
    </footer>`;
}

function shortHost() {
  try { return new URL(state.env.values.baseUrl).host; } catch { return state.env.values.baseUrl; }
}

function nav(active) {
  return state.catalog.categories.map((category) => `
    <h2>${esc(category.title)}</h2>
    ${category.items.map((item) => {
      const page = state.pages.get(item.id);
      if (!page) return '';
      const method = item.type === 'guide' ? 'guide' : String(page.method || '').toLowerCase();
      const label = item.type === 'guide' ? 'Guía' : page.method;
      return `<a class="nav-link ${item.id === active ? 'active' : ''}" href="#/${esc(item.id)}">
        <span class="method ${esc(method)}">${esc(label)}</span>
        <span>${esc(page.nav || page.title)}</span>
      </a>`;
    }).join('')}
  `).join('');
}

function searchResults() {
  const results = search(state.query).slice(0, 8);
  if (!state.query.trim()) return '';
  if (!results.length) return '<div class="search-pop"><div class="search-empty">Sin resultados</div></div>';
  return `<div class="search-pop">${results.map((item, index) => `
    <button class="search-item ${index === state.activeSearch ? 'active' : ''}" data-go="${esc(item.id)}">
      ${esc(item.title)}
      <small>${esc(item.meta)}</small>
    </button>`).join('')}</div>`;
}

function search(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const results = [];
  for (const [id, page] of state.pages) {
    const haystack = JSON.stringify(page).toLowerCase();
    if (!haystack.includes(needle)) continue;
    results.push({
      id,
      title: page.title,
      meta: page.path || page.summary || ''
    });
  }
  return results;
}

function guide(page) {
  return `
    <article>
      <header class="page-head">
        <div class="kicker">${esc(page.category)}</div>
        <h1>${esc(page.title)}</h1>
        <p class="summary">${rich(page.summary)}</p>
      </header>
      <div class="prose">${blocks(page.blocks)}</div>
    </article>`;
}

function blocks(items = []) {
  return items.map((block) => {
    if (block.type === 'h2') return `<h2>${rich(block.text)}</h2>`;
    if (block.type === 'h3') return `<h3>${rich(block.text)}</h3>`;
    if (block.type === 'p') return `<p>${rich(fill(block.text))}</p>`;
    if (block.type === 'ul') return `<ul>${block.items.map((item) => `<li>${rich(fill(item))}</li>`).join('')}</ul>`;
    if (block.type === 'ol') return `<ol>${block.items.map((item) => `<li>${rich(fill(item))}</li>`).join('')}</ol>`;
    if (block.type === 'callout') return callout(block);
    if (block.type === 'table') return table(block.headers, block.rows);
    if (block.type === 'code') return codeBlock(block.title || block.lang || 'Ejemplo', fill(block.code), block.lang || 'bash');
    if (block.type === 'cards') return `<div class="cards">${block.items.map((item) => `
      <a class="card" href="#/${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.text)}</span></a>`).join('')}</div>`;
    if (block.type === 'errorCodes') return errorTable(block.group);
    return '';
  }).join('');
}

function endpoint(page) {
  const request = page.request === undefined ? undefined : applyPlaceholders(page.request, state.env);
  const samples = (page.responses || []).map((sample) => ({
    ...sample,
    body: applyPlaceholders(sample.body, state.env)
  }));
  const curl = buildCurl({
    method: page.method,
    path: fill(page.path),
    auth: page.auth,
    body: request,
    env: state.env,
    shell: state.shell
  });
  return `
    <article>
      <header class="page-head">
        <div class="kicker">${esc(page.category)}</div>
        <h1>${esc(page.title)}</h1>
        <p class="summary">${rich(page.summary)}</p>
        <div class="route">
          <span class="method ${esc(page.method.toLowerCase())}">${esc(page.method)}</span>
          <code>${esc(state.env.values.baseUrl.replace(/\/$/, ''))}${esc(fill(page.path))}</code>
          <span class="badge ${page.auth === 'optional' ? 'warn' : ''}">${esc(authLabel(page.auth))}</span>
        </div>
      </header>
      <div class="doc">
        <div class="prose">
          ${paragraphs(page.purpose)}
          ${(page.notes || []).map(callout).join('')}
          <h2>Headers</h2>
          ${table(['Header', 'Obligatorio', 'Descripción'], (page.headers || []).map((header) => [header.name, header.required ? 'Sí' : 'No', header.description]))}
          ${page.parameters?.length ? `<h2>Parámetros</h2>${paramTable(page.parameters)}` : ''}
          ${(page.groups || []).map((group) => `<h3>${esc(group.title)}</h3>${group.description ? `<p>${rich(group.description)}</p>` : ''}${paramTable(group.parameters)}`).join('')}
          ${page.errors?.length ? `<h2>Respuestas y errores</h2>${table(['Situación', 'HTTP', 'Cuerpo'], page.errors.map((error) => [error.situation, String(error.http), error.body]))}` : ''}
          ${page.considerations?.length ? `<h2>Consideraciones</h2><ul>${page.considerations.map((item) => `<li>${rich(item)}</li>`).join('')}</ul>` : ''}
          ${blocks(page.extraBlocks)}
          <p class="source">Contrato leído de <code>${esc(page.source)}</code>. Los valores de los ejemplos son ilustrativos.</p>
        </div>
        <aside class="examples">
          <div class="shell-switch">
            <button class="tab ${state.shell === 'bash' ? 'active' : ''}" data-shell="bash">Bash</button>
            <button class="tab ${state.shell === 'powershell' ? 'active' : ''}" data-shell="powershell">PowerShell</button>
          </div>
          ${sample('cURL', curl, state.shell === 'powershell' ? 'powershell' : 'bash')}
          ${request !== undefined ? sample('Request', pretty(request), 'json') : ''}
          ${samples.map((sampleItem) => sample(sampleItem.title, pretty(sampleItem.body), 'json')).join('')}
        </aside>
      </div>
    </article>`;
}

function paragraphs(items = []) {
  return items.map((text) => `<p>${rich(text)}</p>`).join('');
}

function paramTable(parameters = []) {
  return table(
    ['Campo', 'Ubicación', 'Tipo', 'Obligatorio', 'Descripción'],
    parameters.map((parameter) => [
      parameter.name,
      parameter.in || 'body',
      parameter.type,
      requiredLabel(parameter.required),
      parameter.description
    ])
  );
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((row) => `<tr>${row.map((cell, index) => tableCell(headers[index], cell)).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}

function tableCell(header, value) {
  const text = fill(value);
  const pill = header === 'Obligatorio' ? ` pill ${text === 'Sí' ? 'yes' : ''}` : '';
  return `<td data-label="${esc(header)}"><span class="cell${pill}">${rich(text)}</span></td>`;
}

function callout(block) {
  return `<div class="callout ${esc(block.tone || 'note')}"><strong>${esc(block.title || 'Nota')}</strong><p>${rich(fill(block.text))}</p></div>`;
}

function codeBlock(title, code, lang) {
  return `<div class="inline-code">${sample(title, code, lang, true)}</div>`;
}

function sample(title, code, lang) {
  return `<section class="sample"><div class="sample-head"><span>${esc(title)}</span><button class="copy-btn" data-copy="${encodeURIComponent(code)}">Copiar</button></div><pre>${highlight(code, lang)}</pre></section>`;
}

function errorTable(groupId) {
  const group = state.errorCodes.groups.find((item) => item.id === groupId);
  if (!group) return '';
  return `${group.note ? `<p>${rich(group.note)}</p>` : ''}${table(['Código', 'Nombre', 'Causa'], group.items.map((item) => [String(item.code), item.name, item.cause]))}`;
}

function authLabel(auth) {
  if (auth === 'required') return 'Bearer obligatorio';
  if (auth === 'optional') return 'Bearer opcional';
  return 'Sin autenticación';
}

function fill(text) {
  return applyPlaceholders(String(text ?? ''), state.env);
}

function envFields() {
  const labels = {
    baseUrl: 'URL base',
    username: 'Usuario ilustrativo',
    password: 'Contraseña ilustrativa',
    token: 'Token ilustrativo',
    serviceCode: 'serviceCode ilustrativo',
    deliveryNumber: 'deliveryNumber ilustrativo',
    trackingCode: 'trackingCode ilustrativo'
  };
  const keys = ['baseUrl', ...Object.keys(state.site.placeholders || {}).filter((key) => key !== 'baseUrl')];
  return keys.map((key) => [key, labels[key] || key]);
}

function envDrawer() {
  const fields = envFields();
  return `
    <div class="backdrop" data-action="close-env"></div>
    <aside class="drawer" role="dialog" aria-label="Datos de ejemplo">
      <h2>Datos de ejemplo</h2>
      <p>Estos valores solo arman los ejemplos y los comandos cURL de esta página. No se envían a Interbook.</p>
      ${fields.map(([key, label]) => `<label class="field">${esc(label)}<input data-env="${esc(key)}" value="${esc(state.env.values[key] || '')}" /></label>`).join('')}
      <div class="drawer-actions">
        <button class="primary" data-action="save-env">Guardar</button>
        <button class="ghost" data-action="reset-env">Restablecer</button>
      </div>
    </aside>`;
}

function bind() {
  const input = document.querySelector('.search input');
  input?.addEventListener('input', () => {
    state.query = input.value;
    state.searchOpen = true;
    state.activeSearch = 0;
    const pop = document.querySelector('.search-pop');
    const fresh = document.createElement('div');
    fresh.innerHTML = searchResults();
    pop?.remove();
    if (fresh.firstChild) input.after(fresh.firstChild);
    bindSearchClicks();
  });
  input?.addEventListener('keydown', (event) => {
    const results = search(state.query);
    if (event.key === 'ArrowDown') {
      state.activeSearch = Math.min(state.activeSearch + 1, Math.max(results.length - 1, 0));
      event.preventDefault();
      refreshSearch();
    } else if (event.key === 'ArrowUp') {
      state.activeSearch = Math.max(state.activeSearch - 1, 0);
      event.preventDefault();
      refreshSearch();
    } else if (event.key === 'Enter' && results[state.activeSearch]) {
      location.hash = `#/${results[state.activeSearch].id}`;
      state.searchOpen = false;
      state.query = '';
    }
  });
  document.querySelectorAll('[data-action]').forEach((node) => node.addEventListener('click', onAction));
  document.querySelectorAll('[data-shell]').forEach((node) => node.addEventListener('click', () => {
    state.shell = node.dataset.shell;
    state.env.shell = state.shell;
    saveEnv();
    render();
  }));
  document.querySelectorAll('[data-copy]').forEach((node) => node.addEventListener('click', () => copy(node)));
  bindSearchClicks();
}

function bindSearchClicks() {
  document.querySelectorAll('[data-go]').forEach((node) => node.addEventListener('click', () => {
    location.hash = `#/${node.dataset.go}`;
    state.searchOpen = false;
    state.query = '';
    state.navOpen = false;
    if (location.hash === `#/${node.dataset.go}`) render();
  }));
}

function refreshSearch() {
  document.querySelector('.search-pop')?.remove();
  const fresh = document.createElement('div');
  fresh.innerHTML = searchResults();
  document.querySelector('.search input')?.after(fresh.firstChild);
  bindSearchClicks();
}

function onAction(event) {
  const action = event.currentTarget.dataset.action;
  if (action === 'nav') state.navOpen = !state.navOpen;
  if (action === 'close-nav') state.navOpen = false;
  if (action === 'env') state.envOpen = true;
  if (action === 'close-env') state.envOpen = false;
  if (action === 'save-env') {
    document.querySelectorAll('[data-env]').forEach((input) => { state.env.values[input.dataset.env] = input.value.trim(); });
    saveEnv();
    state.envOpen = false;
  }
  if (action === 'reset-env') {
    state.env.values = { ...state.env.defaults };
    saveEnv();
    state.envOpen = false;
  }
  render();
}

async function copy(button) {
  const text = decodeURIComponent(button.dataset.copy);
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
  button.textContent = 'Copiado';
  button.classList.add('copied');
  setTimeout(() => {
    button.textContent = 'Copiar';
    button.classList.remove('copied');
  }, 1400);
}
