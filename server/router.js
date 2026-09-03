// The route table and the two gates in front of it.
//
// Everything arrives here: one function decides whether a request is allowed to
// be answered at all, then which handler answers it. The routes are a list rather
// than a ladder of `if` statements so that the whole surface of the server is
// visible in one screen — six endpoints, and everything else is a static file.
//
// Neither gate is authentication. A local server with no accounts cannot
// authenticate anyone; what it can do is refuse requests that a browser on some
// other site made on the person's behalf. `server/httpGuards.js` explains both
// attacks; the short version is that `Host` stops DNS rebinding from turning
// `evil.com` into our own origin, and `Origin`/`Sec-Fetch-Site` stops a page the
// person happened to have open from driving the API.

import { handleDocs } from './apiDocs.js';
import { handleFile } from './apiFile.js';
import { handleCleanup, handleScan } from './apiScan.js';
import { sendError, sendJSON, readBody } from './http.js';
import { crossOriginReason, rebindingReason } from './httpGuards.js';
import { proxyChat } from './llmProxy.js';
import { serveStatic } from './static.js';
import { handleSearch } from './apiSearch.js';
import { handleBlame } from './apiGitBlame.js';
import { handleDiff, handleDiffRefs } from './apiDiff.js';

const ROUTES = [
  {
    method: 'GET', path: '/api/diff/refs', sameOrigin: true,
    run: ({ res, url }) => handleDiffRefs(res, url.searchParams.get('scan')),
  },
  {
    method: 'GET', path: '/api/diff', sameOrigin: true,
    run: ({ res, url }) => handleDiff(res, url.searchParams.get('scan'), url.searchParams),
  },
  {
    method: 'POST', path: '/api/search', body: true,
    run: ({ res, body }) => handleSearch(res, body),
  },
  {
    method: 'GET', path: '/api/blame', sameOrigin: true,
    run: ({ res, url }) => handleBlame(res, url.searchParams.get('scan'), url.searchParams.get('path')),
  },
  {
    method: 'POST', path: '/api/scan', body: true,
    run: ({ res, body, config }) => handleScan(res, body, config),
  },
  {
    method: 'DELETE', prefix: '/api/scan/',
    run: ({ res, rest }) => handleCleanup(res, decodeURIComponent(rest)),
  },
  {
    method: 'GET', path: '/api/file', sameOrigin: true,
    run: ({ res, url }) => handleFile(res, url.searchParams.get('scan'), url.searchParams.get('path')),
  },
  {
    // The proxy is the handler; there is no wrapper to write. It forwards the
    // browser's key to the endpoint the browser chose and never keeps either.
    method: 'POST', path: '/api/explain', body: true,
    run: ({ res, body }) => proxyChat(res, body),
  },
  {
    method: 'POST', path: '/api/doc', body: true,
    run: ({ res, body }) => handleDocs(res, body),
  },
  {
    method: 'GET', path: '/api/health',
    run: ({ res }) => sendJSON(res, 200, { ok: true }),
  },
];

// The table itself, for the test that walks it. Exported read-only: the routes
// are decided here, not assembled by whoever imports this.
export const routes = Object.freeze(ROUTES.map((r) => Object.freeze({ ...r })));

export function matchRoute(method, pathname) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    if (route.path === pathname) return { route, rest: '' };
    if (route.prefix && pathname.startsWith(route.prefix)) {
      return { route, rest: pathname.slice(route.prefix.length) };
    }
  }
  return null;
}

// `config` carries the directories the handlers need — the project root to scan
// for the demo, and the two roots static serving maps into. Passed in rather
// than resolved here so a test can point the server somewhere else, and so this
// module has nothing to say about where it was installed.
export function createRouter(config) {
  return async function handleRequest(req, res) {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');

      const wrongHost = rebindingReason(req);
      if (wrongHost) {
        return sendError(res, 403, 'Onboarder only answers to localhost. ' + wrongHost);
      }

      const found = matchRoute(req.method, url.pathname);
      if (req.method !== 'GET' || found?.route.sameOrigin) {
        const foreign = crossOriginReason(req);
        if (foreign) {
          return sendError(res, 403, 'That request did not come from Onboarder’s own page. ' + foreign);
        }
      }

      if (found) {
        const body = found.route.body ? await readBody(req) : null;
        return await found.route.run({ req, res, url, body, rest: found.rest, config });
      }

      if (req.method === 'GET') return await serveStatic(res, url.pathname, config);

      sendError(res, 404, 'Nothing lives at ' + url.pathname + '.');
    } catch (err) {
      // The last resort. Handlers turn their own expected failures into a status
      // that says something useful; anything reaching here is a bug or a broken
      // request body, and the message is more use to the person than "500".
      sendError(res, 500, err.message || 'Something went sideways.');
    }
  };
}
