// Only fixed authentication/startup paths are measured. Never log URLs with queries,
// cookies, OAuth codes/tokens, profiles, request bodies or database contents.
const PATHS = /^\/api\/(?:auth\/(?:google|yandex)\/(?:start|callback)|auth\/providers|me|students|workspaces)$/;
const ms = (start) => Math.round((performance.now() - start) * 10) / 10;

export function requestTiming(req) {
  const path = new URL(req.url).pathname;
  const enabled = req.method === 'GET' && PATHS.test(path);
  const start = performance.now(), stages = {}, requestId = enabled ? crypto.randomUUID() : '';
  return {
    async measure(name, action) {
      if (!enabled) return action();
      const since = performance.now();
      try { return await action(); }
      finally { stages[name] = ms(since); }
    },
    finish(response) {
      if (!enabled) return response;
      const timings = { ...stages, total: ms(start) };
      const location = response.headers.get('location');
      const outcome = response.status >= 400 ? 'error' : path.endsWith('/callback')
        ? (location === '/students' ? 'signed_in' : 'not_signed_in') : 'ok';
      console.info(JSON.stringify({ event: 'auth_timing', request_id: requestId, path, status: response.status, outcome, timings }));
      const result = new Response(response.body, response);
      result.headers.set('Server-Timing', Object.entries(timings).map(([name, duration]) => `${name};dur=${duration}`).join(', '));
      result.headers.set('X-Menty-Request-Id', requestId);
      return result;
    },
  };
}
