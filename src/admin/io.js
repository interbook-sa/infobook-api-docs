import { normalizeBundle } from '../content/bundle.js';
import { folderFor } from '../content/bundle.js';

export async function parseImportFiles(fileList) {
  const files = [...fileList];
  if (!files.length) throw new Error('No se eligió ningún archivo.');
  const parsed = [];
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error(`${file.name} no es JSON válido.`);
    }
    parsed.push({ name: file.name, data });
  }

  const bundles = parsed.filter((file) => file.data && typeof file.data === 'object' && file.data.pages && file.data.catalog && file.data.site);
  if (bundles.length && parsed.length > 1) {
    throw new Error('Subí el paquete completo solo, o los archivos sueltos, no las dos cosas juntas.');
  }
  if (bundles.length === 1) return normalizeBundle(bundles[0].data);

  const bundle = { version: 1, site: null, catalog: null, errorCodes: null, pages: {} };
  for (const file of parsed) {
    const name = file.name.toLowerCase();
    if (name === 'site.json') {
      if (bundle.site) throw new Error('Hay más de un site.json.');
      bundle.site = file.data;
    } else if (name === 'catalog.json') {
      if (bundle.catalog) throw new Error('Hay más de un catalog.json.');
      bundle.catalog = file.data;
    } else if (name === 'error-codes.json') {
      if (bundle.errorCodes) throw new Error('Hay más de un error-codes.json.');
      bundle.errorCodes = file.data;
    } else if (file.data?.id) {
      bundle.pages[file.data.id] = file.data;
    } else {
      throw new Error(`${file.name} no es un paquete, ni site, ni catálogo, ni códigos, ni una página con id.`);
    }
  }
  return normalizeBundle(bundle);
}

export function downloadBundle(bundle) {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    site: bundle.site,
    catalog: bundle.catalog,
    errorCodes: bundle.errorCodes,
    pages: bundle.pages
  };
  downloadJson('interbook-docs.json', payload);
}

export function downloadPage(page) {
  downloadJson(`${page.id}.json`, page);
}

function downloadJson(filename, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function writeBundleToDirectory(bundle) {
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('Este navegador no puede escribir una carpeta. Usá la exportación del paquete.');
  }
  const root = await window.showDirectoryPicker({ mode: 'readwrite' });
  await writeJson(root, 'site.json', bundle.site);
  await writeJson(root, 'catalog.json', bundle.catalog);
  const shared = await root.getDirectoryHandle('shared', { create: true });
  await writeJson(shared, 'error-codes.json', bundle.errorCodes);
  const endpoints = await root.getDirectoryHandle('endpoints', { create: true });
  const guides = await root.getDirectoryHandle('guides', { create: true });
  const written = new Set();
  for (const category of bundle.catalog.categories) {
    for (const item of category.items) {
      const folder = item.type === 'guide' ? guides : endpoints;
      await writeJson(folder, `${item.id}.json`, bundle.pages[item.id]);
      written.add(`${folderFor(item.type)}/${item.id}.json`);
    }
  }
  const leftover = [];
  leftover.push(...await extraJson(endpoints, 'endpoints', bundle, 'endpoint'));
  leftover.push(...await extraJson(guides, 'guides', bundle, 'guide'));
  return { written: written.size + 3, leftover };
}

async function extraJson(dir, folder, bundle, type) {
  const names = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
    const id = name.replace(/\.json$/, '');
    const item = findItem(bundle, id);
    if (!item || (type === 'guide' && item.type !== 'guide') || (type === 'endpoint' && item.type !== 'endpoint')) {
      names.push(`${folder}/${name}`);
    }
  }
  return names;
}

function findItem(bundle, id) {
  for (const category of bundle.catalog.categories) {
    const item = category.items.find((entry) => entry.id === id);
    if (item) return item;
  }
  return null;
}

async function writeJson(dir, name, data) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(`${JSON.stringify(data, null, 2)}\n`);
  await writable.close();
}
