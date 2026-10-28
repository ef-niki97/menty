// Local browser diagnostics only: no analytics endpoint or user data.
const round = (value) => Math.round(value * 10) / 10;
const data = { version: 1, startup: {}, requests: [] };
window.__mentyDiagnostics = data;

export function recordApiTiming(path, start, response) {
  if (!['/me', '/students', '/workspaces', '/auth/providers'].includes(path)) return;
  const server = {};
  for (const metric of (response?.headers.get('Server-Timing') || '').split(',')) {
    const match = metric.trim().match(/^(\w+);dur=([\d.]+)$/);
    if (match && Number.isFinite(Number(match[2]))) server[match[1]] = Number(match[2]);
  }
  const id = response?.headers.get('X-Menty-Request-Id') || '';
  const entry = { path, status: response?.status || 0, start_ms: round(start), duration_ms: round(performance.now() - start),
    request_id: /^[a-f\d-]{36}$/i.test(id) ? id : null, server_ms: server };
  data.requests.push(entry);
  if (data.requests.length > 30) data.requests.shift();
  console.info('[Menty request]', JSON.stringify(entry));
}

export async function measureStartup(name, action) {
  const start = performance.now();
  try { return await action(); }
  finally { data.startup[`${name}_ms`] = round(performance.now() - start); }
}

export function beginStartup() {
  data.startup.script_ready_ms = round(performance.now());
}

export function finishStartup() {
  // Wait until the rendered page has had an opportunity to paint.
  requestAnimationFrame(() => setTimeout(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    data.startup.document_ms = navigation ? round(navigation.responseEnd) : null;
    data.startup.ready_ms = round(performance.now());
    console.info('[Menty startup]', JSON.stringify(data));
  }, 0));
}
