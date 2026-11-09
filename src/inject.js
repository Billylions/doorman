// Placeholder injection and output redaction.
// The AI writes {{doorman:name}}; Doorman swaps in the real value at the
// last moment and scrubs it from anything that comes back.

export const PLACEHOLDER_RE = /\{\{\s*doorman:((?:[a-z0-9][a-z0-9-]{0,39}\/)?[A-Za-z0-9_-]+)\s*\}\}/g;

export function placeholder(name) {
  return `{{doorman:${name}}}`;
}

/** Collect the secret names referenced in any number of strings. */
export function findPlaceholders(...texts) {
  const names = new Set();
  for (const t of texts) {
    if (typeof t !== 'string') continue;
    for (const m of t.matchAll(PLACEHOLDER_RE)) names.add(m[1]);
  }
  return [...names];
}

/** Replace placeholders using a name -> replacement map. */
export function fill(text, map) {
  if (typeof text !== 'string') return text;
  return text.replace(PLACEHOLDER_RE, (whole, name) => (name in map ? map[name] : whole));
}

/** Does `host` match an allowlist entry ("api.stripe.com" or "*.stripe.com")? */
export function hostAllowed(host, allowedHosts) {
  const h = host.toLowerCase();
  return allowedHosts.some((rule) => {
    if (rule.startsWith('*.')) {
      const base = rule.slice(2);
      return h === base || h.endsWith('.' + base);
    }
    return h === rule;
  });
}

function variants(value) {
  const out = new Set([value]);
  const b64 = Buffer.from(value, 'utf8').toString('base64');
  out.add(b64);
  out.add(b64.replace(/=+$/, ''));
  out.add(Buffer.from(value, 'utf8').toString('base64url'));
  out.add(encodeURIComponent(value));
  out.add(JSON.stringify(value).slice(1, -1));
  return [...out].filter((v) => v.length >= 4);
}

/**
 * Build a redactor that replaces every known secret value (and common
 * encodings of it) with [doorman:name]. Longest values first so a secret
 * that contains another is fully removed.
 */
export function makeRedactor(secrets /* {name: value} */) {
  const pairs = [];
  for (const [name, value] of Object.entries(secrets)) {
    if (!value || value.length < 4) continue;
    for (const v of variants(value)) pairs.push([v, `[doorman:${name}]`]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  return (text) => {
    if (typeof text !== 'string' || !text) return text;
    let out = text;
    for (const [v, label] of pairs) out = out.split(v).join(label);
    return out;
  };
}
