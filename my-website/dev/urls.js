// Resolves the origins this workspace is actually reachable at.
//
// In a GitHub Codespace every forwarded port is published under its own
// generated hostname (`<codespace>-<port>.app.github.dev`), so none of these
// URLs can be hardcoded — they change with every codespace.

const TINA_PORT = Number(process.env.TINA_PORT || 4001);
const SITE_PORT = Number(process.env.PORT || 3000);

const IS_CODESPACE = Boolean(
  process.env.CODESPACE_NAME &&
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN,
);

/** The origin a browser outside the codespace uses to reach a forwarded port. */
function publicOrigin(port) {
  if (IS_CODESPACE) {
    const {CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN} =
      process.env;
    return `https://${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  }
  return `http://localhost:${port}`;
}

/** Origin the Docusaurus dev server (and therefore the Tina admin) is served from. */
function siteOrigin() {
  return publicOrigin(SITE_PORT);
}

/**
 * Content API URL for the Tina admin.
 *
 * The Tina GraphQL server stays bound to localhost:4001; the Docusaurus dev
 * server proxies `/graphql`, `/media` & co. through to it (see
 * ./tina-proxy-plugin.js), so the admin only ever talks to its own origin and
 * port 4001 never needs to be forwarded or made public.
 *
 * The `#localhost` fragment is load-bearing: Tina decides whether the admin is
 * in local mode by testing this string for the substring "localhost"
 * (`parseURL` in @tinacms/schema-tools). Without it the Codespace hostname
 * makes the admin think it is a self-hosted deployment, which switches it to
 * TinaCloud auth and disables the local media store. A fragment is never sent
 * over the wire — both `fetch()` and `new URL(...).origin` drop it.
 */
function contentApiUrl() {
  const url = `${siteOrigin()}/graphql`;
  return url.includes('localhost') ? url : `${url}#localhost`;
}

module.exports = {
  IS_CODESPACE,
  SITE_PORT,
  TINA_PORT,
  contentApiUrl,
  publicOrigin,
  siteOrigin,
};
