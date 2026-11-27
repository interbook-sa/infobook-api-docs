import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCurl } from '../src/curl.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = path.join(root, 'public', 'content');
const errors = [];

const routes = {
  login: ['POST', '/api/auth/login/'],
  'express-orders': ['POST', '/api/wms/expressOrders'],
  orders: ['POST', '/api/wms/orders'],
  'cancel-order': ['POST', '/api/wms/cancelOrder'],
  'get-orders': ['POST', '/api/wms/GetOrders'],
  'track-orders': ['POST', '/api/wms/track_orders'],
  'tracking-legacy': ['POST', '/api/wms/tracking'],
  'shipping-cost': ['POST', '/api/wms/GetShippingCost'],
  'delivery-date': ['POST', '/api/wms/getDeliveryDate'],
  'get-stock': ['POST', '/api/wms/GetStock'],
  'get-label': ['POST', '/api/wms/Getlabel'],
  documents: ['POST', '/api/wms/Documents'],
  'consignment-details': ['POST', '/api/wms/ConsignmentDetails'],
  'get-ingresos': ['POST', '/api/wms/getIngresos']
};

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
const env = {
  defaults: { baseUrl: site.baseUrl, ...site.placeholders },
  values: { baseUrl: site.baseUrl, ...site.placeholders }
};

const ids = new Set();
for (const category of catalog.categories) {
  for (const item of category.items) {
    if (ids.has(item.id)) fail(`id repetido en el catálogo: ${item.id}`);
    ids.add(item.id);
    const folder = item.type === 'guide' ? 'guides' : 'endpoints';
    const page = await readJson(`${folder}/${item.id}.json`);
    if (page.id !== item.id) fail(`${item.id}: el id del archivo no coincide`);
    if (!page.title || !page.summary) fail(`${item.id}: falta title o summary`);
    if (item.type === 'guide' && !Array.isArray(page.blocks)) fail(`${item.id}: una guía necesita blocks`);
    if (item.type !== 'endpoint') continue;
    const expected = routes[item.id];
    if (!expected) fail(`${item.id}: falta en la lista de rutas verificadas`);
    else if (page.method !== expected[0] || page.path !== expected[1]) {
      fail(`${item.id}: se documentó ${page.method} ${page.path} y el contrato verificado es ${expected[0]} ${expected[1]}`);
    }
    if (!['required', 'optional', 'none'].includes(page.auth)) fail(`${item.id}: auth inválido`);
    if (!page.source) fail(`${item.id}: falta source`);
    for (const sample of page.responses || []) {
      JSON.stringify(sample.body);
    }
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

for (const id of Object.keys(routes)) {
  if (!ids.has(id)) fail(`la ruta verificada ${id} no está en el catálogo`);
}

const groups = new Set(errorCodes.groups.map((group) => group.id));
for (const required of ['validation', 'processing', 'defined-not-checked']) {
  if (!groups.has(required)) fail(`falta el grupo de errores ${required}`);
}

const files = await readdir(path.join(content, 'endpoints'));
for (const file of files) {
  const id = file.replace(/\.json$/, '');
  if (!ids.has(id)) fail(`endpoint sin catálogo: ${file}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Documentación válida: ${ids.size} páginas, ${Object.keys(routes).length} endpoints.`);
