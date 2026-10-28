import { recordApiTiming } from './diagnostics.js';

// Тонкая обёртка над fetch для запросов к /api. Сессия — HttpOnly-кука, её ставит сервер.
export async function api(method, path, body, raw = false) {
  const isBlob = body instanceof Blob;
  const start = performance.now();
  let res;
  try {
    res = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: body !== undefined && !isBlob ? { 'content-type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
    });
    if (res.status === 401) window.dispatchEvent(new Event('menty:unauth'));
    if (!res.ok) { const e = new Error(`${res.status}`); e.status = res.status; throw e; }
    return raw ? res : await res.json();
  } finally { if (method === 'GET') recordApiTiming(path, start, res); }
}
