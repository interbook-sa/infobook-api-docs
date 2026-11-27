export const BLOCK_LABELS = [
  ['p', 'Párrafo'],
  ['h2', 'Título'],
  ['h3', 'Subtítulo'],
  ['ul', 'Lista'],
  ['ol', 'Lista numerada'],
  ['callout', 'Nota'],
  ['table', 'Tabla'],
  ['code', 'Código'],
  ['cards', 'Tarjetas'],
  ['errorCodes', 'Tabla de códigos']
];

export const BLOCK_TEMPLATES = {
  h2: { type: 'h2', text: '' },
  h3: { type: 'h3', text: '' },
  p: { type: 'p', text: '' },
  ul: { type: 'ul', items: [''] },
  ol: { type: 'ol', items: [''] },
  callout: { type: 'callout', tone: 'note', title: '', text: '' },
  table: { type: 'table', headers: ['Columna', 'Detalle'], rows: [['', '']] },
  code: { type: 'code', lang: 'bash', title: 'Ejemplo', code: '' },
  cards: { type: 'cards', items: [{ id: '', title: '', text: '' }] },
  errorCodes: { type: 'errorCodes', group: 'validation' }
};

export const OBJECT_TEMPLATES = {
  parameter: { name: '', in: 'body', type: 'string', required: 'no', description: '' },
  header: { name: '', required: true, description: '' },
  note: { tone: 'note', title: '', text: '' },
  error: { situation: '', http: '200', body: '' },
  response: { title: 'HTTP 200', body: {} },
  group: { title: '', description: '', parameters: [] },
  card: { id: '', title: '', text: '' },
  errorItem: { code: 0, name: '', cause: '' },
  errorGroup: { id: '', title: '', note: '', items: [] }
};

export function getPath(root, path) {
  return String(path || '').split('.').reduce((value, key) => value?.[key], root);
}

export function setPath(root, path, value) {
  const keys = String(path || '').split('.');
  let cursor = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cursor = cursor?.[keys[i]];
    if (cursor == null) return false;
  }
  cursor[keys[keys.length - 1]] = value;
  return true;
}

export function ensureArray(root, path) {
  const keys = String(path || '').split('.');
  let cursor = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cursor = cursor?.[keys[i]];
    if (cursor == null) return null;
  }
  const last = keys[keys.length - 1];
  if (!Array.isArray(cursor[last])) cursor[last] = [];
  return cursor[last];
}

export function moveItem(list, index, delta) {
  const next = index + delta;
  if (!Array.isArray(list) || next < 0 || next >= list.length) return false;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
  return true;
}

export function removeItem(list, index) {
  if (!Array.isArray(list) || index < 0 || index >= list.length) return false;
  list.splice(index, 1);
  return true;
}
