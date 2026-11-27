import { cloneBundle } from './bundle.js';

export const DRAFT_KEY = 'interbook-docs-draft';
const BACKUPS_KEY = 'interbook-docs-backups';
const MAX_BACKUPS = 3;

export function readDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data?.bundle?.site || !data.bundle.catalog || !data.bundle.pages) return { corrupt: true };
    return data;
  } catch {
    return { corrupt: true };
  }
}

export function writeDraft(bundle) {
  const payload = JSON.stringify({ updatedAt: new Date().toISOString(), bundle });
  try {
    localStorage.setItem(DRAFT_KEY, payload);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'El navegador no pudo guardar el borrador. Exportá el JSON para no perderlo.'
    };
  }
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export function readBackups() {
  try {
    const data = JSON.parse(localStorage.getItem(BACKUPS_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function pushBackup(bundle, reason) {
  const backups = readBackups();
  backups.unshift({
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()),
    at: new Date().toISOString(),
    reason,
    bundle: cloneBundle(bundle)
  });
  const next = backups.slice(0, MAX_BACKUPS);
  try {
    localStorage.setItem(BACKUPS_KEY, JSON.stringify(next));
    return { ok: true };
  } catch {
    try {
      localStorage.setItem(BACKUPS_KEY, JSON.stringify(next.slice(0, 1)));
      return { ok: true, trimmed: true };
    } catch {
      return { ok: false };
    }
  }
}
