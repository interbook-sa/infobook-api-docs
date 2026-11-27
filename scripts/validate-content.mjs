import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERIFIED_ROUTES } from '../src/content/contracts.js';
import { validateBundle } from '../src/content/validate.js';
import { buildCurl } from '../src/curl.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = path.join(root, 'public', 'content');
const errors = [];

function fail(message) {
  errors.push(message);
}

async function readJson(relative) {
  const file = path.join(content, relative);
  const text = await readFile(file, 'utf8');
  if (/Password\s*=|Data Source=|Server=|BEGIN (RSA |OPENSSH )?PRIVATE KEY/i.test(text)) {
    fail(`${relative} contiene un secreto o una cadena de conexión`);
  }
  return JSON.parse(text);
}

const site = await readJson('site.json');
const catalog = await readJson('catalog.json');
const errorCodes = await readJson('shared/error-codes.json');
const pages = {};
const ids = new Set();

for (const category of catalog.categories || []) {
  for (const item of category.items || []) {
    if (!item?.id || ids.has(item.id)) continue;
    ids.add(item.id);
    const folder = item.type === 'guide' ? 'guides' : 'endpoints';
    try {
      pages[item.id] = await readJson(`${folder}/${item.id}.json`);
    } catch (error) {
      fail(`${item.id}: no se pudo leer (${error.message})`);
    }
  }
}

const report = validateBundle({ version: 1, site, catalog, errorCodes, pages });
for (const message of report.errors) fail(message);
for (const message of report.warnings) console.warn(message);

const env = {
  defaults: { baseUrl: site.baseUrl, ...site.placeholders },
  values: { baseUrl: site.baseUrl, ...site.placeholders }
};

for (const category of catalog.categories || []) {
  for (const item of category.items || []) {
    if (item?.type === 'guide') continue;
    const page = pages[item.id];
    if (!page?.method || !page.path) continue;
    for (const shell of ['bash', 'powershell']) {
      const curl = buildCurl({
        method: page.method,
        path: page.path,
        auth: page.auth,
        body: page.request,
        env,
        shell
      });
      if (!curl.includes(page.method) || !curl.includes(page.path)) fail(`${item.id}: el cURL ${shell} no incluye método o ruta`);
      if (!curl.includes('Content-Type: application/json')) fail(`${item.id}: el cURL no declara JSON`);
      if (page.auth === 'none' && curl.includes('Authorization')) fail(`${item.id}: el login no debe mandar Authorization`);
      if (page.auth !== 'none' && !curl.includes('Authorization: Bearer')) fail(`${item.id}: falta el Bearer`);
      if (shell === 'powershell' && !curl.startsWith('curl.exe ')) fail(`${item.id}: PowerShell debe usar curl.exe`);
      if (shell === 'bash' && !curl.startsWith('curl ')) fail(`${item.id}: Bash debe usar curl`);
      if (curl.includes('\n')) fail(`${item.id}: el cURL debe ser una sola línea para poder pegarse`);
    }
  }
}

for (const folder of ['endpoints', 'guides']) {
  const files = await readdir(path.join(content, folder));
  const label = folder === 'guides' ? 'guía' : 'endpoint';
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const id = file.replace(/\.json$/, '');
    if (!ids.has(id)) fail(`${label} sin catálogo: ${file}`);
  }
}

if (errors.length) {
  console.error([...new Set(errors)].join('\n'));
  process.exit(1);
}

console.log(`Documentación válida: ${ids.size} páginas, ${Object.keys(VERIFIED_ROUTES).length} operaciones con contrato verificado.`);
