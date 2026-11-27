export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function rich(text) {
  const source = String(text ?? '');
  const token = /(`[^`]+`|\[[^\]]+\]\(#[^)]+\))/g;
  let html = '';
  let last = 0;
  for (const match of source.matchAll(token)) {
    html += esc(source.slice(last, match.index));
    const part = match[0];
    if (part.startsWith('`')) {
      html += `<code>${esc(part.slice(1, -1))}</code>`;
    } else {
      const link = part.match(/^\[([^\]]+)\]\(#\/([^)]+)\)$/);
      if (link) html += `<a href="#/${esc(link[2])}">${esc(link[1])}</a>`;
      else html += esc(part);
    }
    last = match.index + part.length;
  }
  html += esc(source.slice(last));
  return html;
}

export function highlight(code, lang) {
  const source = esc(code);
  if (lang === 'json') {
    return source.replace(
      /(&quot;(?:\\.|[^&])*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g,
      (token, str, colon, word) => {
        if (str && colon) return `<span class="tok-key">${str}</span>${colon}`;
        if (str) return `<span class="tok-str">${str}</span>`;
        if (word) return `<span class="tok-kw">${word}</span>`;
        return `<span class="tok-num">${token}</span>`;
      }
    );
  }
  if (lang === 'bash' || lang === 'powershell') {
    return source
      .replace(/(^|\n)(\s*#.*)/g, '$1<span class="tok-cmt">$2</span>')
      .replace(/(&quot;(?:\\.|[^&])*?&quot;|&#39;(?:\\.|[^&])*?&#39;)/g, '<span class="tok-str">$1</span>');
  }
  return source;
}

export function pretty(value) {
  return JSON.stringify(value, null, 2);
}

const REQUIRED = {
  yes: 'Sí',
  no: 'No',
  'if-present': 'Si enviás el objeto',
  recommended: 'Recomendado'
};

export function requiredLabel(value) {
  return REQUIRED[value] || value || 'No';
}
