export function applyPlaceholders(value, env) {
  const map = Object.entries(env.defaults || {})
    .filter((entry) => typeof entry[1] === 'string' && entry[1].length > 0)
    .sort((a, b) => b[1].length - a[1].length);
  const replace = (text) => {
    let out = String(text);
    for (const [key, current] of Object.entries(env.values || {})) {
      out = out.split(`{{${key}}}`).join(current ?? '');
    }
    for (const [key, original] of map) {
      const current = env.values[key] ?? original;
      if (current !== original) out = out.split(original).join(current);
    }
    return out;
  };
  if (typeof value === 'string') return replace(value);
  try {
    return JSON.parse(replace(JSON.stringify(value)));
  } catch {
    return value;
  }
}

function jsonArg(body, shell) {
  const json = JSON.stringify(body);
  if (shell === 'powershell') return `'${json.replace(/'/g, "''")}'`;
  return `'${json.replace(/'/g, `'\\''`)}'`;
}

export function buildCurl({ method, path, auth, body, env, shell }) {
  const base = String(env.values.baseUrl || '').replace(/\/$/, '');
  const url = `${base}${path}`;
  const bin = shell === 'powershell' ? 'curl.exe' : 'curl';
  const parts = [`${bin} -sS -X ${method} "${url}"`];
  if (auth === 'required' || auth === 'optional') {
    parts.push(`-H "Authorization: Bearer ${env.values.token}"`);
  }
  if (body !== undefined) {
    parts.push(`-H "Content-Type: application/json"`);
    parts.push(`-d ${jsonArg(body, shell)}`);
  } else if (method !== 'GET') {
    parts.push(`-H "Content-Type: application/json"`);
  }
  return parts.join(' ');
}
