export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PLACEHOLDER_KEY_RE = /^[A-Za-z][A-Za-z0-9]*$/;

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
