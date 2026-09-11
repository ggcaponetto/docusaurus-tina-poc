const fs = require('node:fs');
const path = require('node:path');
const {TINA_PORT, siteOrigin} = require('./urls');
const {
  PUBLISH_PATH,
  PUBLISH_PORT,
  startPublishServer,
} = require('./publish-server');

// `localhost`, not a literal IP: Tina's Vite server binds whichever loopback
// family Node resolves first, which is `::1` here.
const TINA_TARGET = `http://localhost:${TINA_PORT}`;

// Endpoints the Tina dev server owns (see the `devServerEndPointsPlugin`
// middleware in @tinacms/cli).
const API_PREFIXES = [
  '/graphql',
  '/media',
  '/searchIndex',
  '/v2/searchIndex',
  '/altair',
];

/**
 * True for requests that must reach the Tina dev server rather than Docusaurus.
 */
function isTinaRequest(pathname, req) {
  if (
    API_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  if (!pathname.startsWith('/admin')) {
    return false;
  }
  // Vite serves the admin SPA under the base path `/admin/`, and its HMR
  // socket connects to that same path.
  if (req.headers.upgrade === 'websocket') {
    return true;
  }
  // `/admin/` and `/admin/index.html` are the static entry point Docusaurus
  // serves out of `static/`. The admin uses hash routing, so every other path
  // under `/admin/` is part of Vite's module graph.
  return (
    pathname !== '/admin' &&
    pathname !== '/admin/' &&
    pathname !== '/admin/index.html'
  );
}

const ORIGIN_FIX_ID = 'tina-same-origin-api';

// Runs between Vite's client (which defines __API_URL__ on globalThis) and
// main.tsx (which reads it when the app renders), so it wins without racing.
const ORIGIN_FIX = `
  <script type="module" id="${ORIGIN_FIX_ID}">
    // The admin answers at more than one origin: the Codespaces forwarded
    // hostname, or plain localhost when VS Code forwards the port. Vite bakes
    // the content API URL in at server start, and reaching the forwarded
    // hostname cross-origin fails - it answers 401 with no CORS headers, since
    // Tina's fetch sends no credentials - which surfaces as "Failed to fetch".
    // Every endpoint is proxied same-origin anyway, so point the content API at
    // whichever origin this page was actually loaded from.
    if (globalThis.__API_URL__) {
      const url = new URL(globalThis.__API_URL__, location.href);
      url.protocol = location.protocol;
      url.host = location.host;
      globalThis.__API_URL__ = url.toString();
    }
  </script>`;

/**
 * Rewrites the `http://localhost:4001` asset URLs that @tinacms/cli bakes into
 * the generated admin entry point into same-origin paths, so the page works
 * from a browser that has no route to the codespace's localhost, and pins the
 * content API to the origin the page was served from.
 */
function patchAdminHtml(htmlPath) {
  let html;
  try {
    html = fs.readFileSync(htmlPath, 'utf8');
  } catch {
    return false;
  }
  let patched = html.replaceAll(`http://localhost:${TINA_PORT}`, '');
  if (!patched.includes(ORIGIN_FIX_ID)) {
    patched = patched.replace(
      /(<script type="module" src="[^"]*@vite\/client"><\/script>)/,
      `$1${ORIGIN_FIX}`,
    );
  }
  if (patched === html) {
    return false;
  }
  fs.writeFileSync(htmlPath, patched);
  return true;
}

/**
 * Keeps the admin entry point patched. @tinacms/cli rewrites the file on every
 * restart of its dev server, so a one-shot patch is not enough.
 */
function watchAdminHtml(siteDir, log) {
  const adminDir = path.join(siteDir, 'static', 'admin');
  const htmlPath = path.join(adminDir, 'index.html');

  let announced = false;
  const patch = () => {
    if (patchAdminHtml(htmlPath) && !announced) {
      announced = true;
      log(`Tina admin: ${siteOrigin()}/admin/index.html`);
    }
  };

  const start = () => {
    if (!fs.existsSync(adminDir)) {
      setTimeout(start, 500).unref();
      return;
    }
    patch();
    let pending = null;
    fs.watch(adminDir, (_event, filename) => {
      if (filename && filename !== 'index.html') {
        return;
      }
      clearTimeout(pending);
      pending = setTimeout(patch, 50);
      pending.unref();
    }).unref();
  };
  start();
}

/**
 * Serves the Tina dev backend through the Docusaurus dev server so that the
 * admin, the GraphQL API and the media endpoints all share one origin.
 *
 * That keeps the Tina server on localhost:4001 — unforwarded and unreachable
 * from outside the codespace — while the single port the browser does talk to
 * (3000) stays behind GitHub's own Codespaces port authentication.
 */
module.exports = function tinaProxyPlugin(context) {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    watchAdminHtml(context.siteDir, (message) =>
      // eslint-disable-next-line no-console
      console.log(`[tina-proxy] ${message}`),
    );
    // Dev only: this endpoint runs git and gh on the developer's behalf.
    startPublishServer(context.siteDir);
  }

  return {
    name: 'tina-proxy',
    configureWebpack(_config, isServer) {
      if (isServer || !isDev) {
        return {};
      }
      return {
        devServer: {
          proxy: [
            {
              context: isTinaRequest,
              target: TINA_TARGET,
              ws: true,
              changeOrigin: true,
              logLevel: 'warn',
            },
            {
              context: (pathname) => pathname.startsWith(PUBLISH_PATH),
              target: `http://127.0.0.1:${PUBLISH_PORT}`,
              logLevel: 'warn',
            },
          ],
        },
      };
    },
  };
};
