export function folderFor(type) {
  return type === 'guide' ? 'guides' : 'endpoints';
}

export function cloneBundle(bundle) {
  return structuredClone({
    version: 1,
    site: bundle.site,
    catalog: bundle.catalog,
    errorCodes: bundle.errorCodes,
    pages: bundle.pages
  });
}

export function fingerprint(bundle) {
  return JSON.stringify({
    version: bundle?.version || 1,
    site: bundle?.site,
    catalog: bundle?.catalog,
    errorCodes: bundle?.errorCodes,
    pages: bundle?.pages
  });
}

export function diffBundles(current, next) {
  const before = new Set(Object.keys(current?.pages || {}));
  const after = new Set(Object.keys(next?.pages || {}));
  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
    changed: [...after].filter((id) => before.has(id) && JSON.stringify(current.pages[id]) !== JSON.stringify(next.pages[id])),
    catalog: JSON.stringify(current?.catalog) !== JSON.stringify(next?.catalog),
    site: JSON.stringify(current?.site) !== JSON.stringify(next?.site),
    errorCodes: JSON.stringify(current?.errorCodes) !== JSON.stringify(next?.errorCodes)
  };
}

export function normalizeBundle(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('El archivo no tiene un objeto JSON.');
  }
  if (data.version != null && data.version !== 1) {
    throw new Error('La versión del archivo no es compatible con este panel.');
  }
  if (!data.site || !data.catalog || !data.errorCodes || !data.pages) {
    throw new Error('El paquete tiene que incluir sitio, catálogo, códigos de error y páginas.');
  }
  return cloneBundle({ version: 1, ...data });
}

async function getJson(url, fresh) {
  const target = fresh ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : url;
  const response = await fetch(target, fresh ? { cache: 'no-store' } : undefined);
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
  return response.json();
}

export async function loadPublished(options = {}) {
  const fresh = Boolean(options.fresh);
  const [site, catalog, errorCodes] = await Promise.all([
    getJson('./content/site.json', fresh),
    getJson('./content/catalog.json', fresh),
    getJson('./content/shared/error-codes.json', fresh)
  ]);
  const pages = {};
  const jobs = [];
  for (const category of catalog.categories || []) {
    for (const item of category.items || []) {
      const url = `./content/${folderFor(item.type)}/${item.id}.json`;
      jobs.push(getJson(url, fresh).then((page) => {
        pages[item.id] = page;
      }));
    }
  }
  await Promise.all(jobs);
  return { version: 1, site, catalog, errorCodes, pages };
}
