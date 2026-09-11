# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
npm install
```

**Note**: feel free to use the package manager of your choice.

## Local Development

```bash
npm run start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

Using SSH:

```bash
USE_SSH=true npm run deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> npm run deploy
```

If you are using GitHub Pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

## TinaCMS in a Codespace

```bash
yarn tina
```

Open the URL that `[tina-proxy]` prints when the compile finishes, e.g.
`https://<codespace>-3000.app.github.dev/admin/index.html`.

**In a Codespace, use port 3000, not 4001.** Tina's own banner says
`<your-dev-server-url>`, and the editor will offer to open the port Tina
listens on — but in a Codespace every port is a separate, private host. Port
4001 serves Vite's stock `index.html` out of `node_modules/@tinacms/app/`,
which never gets the patch that points the content API at the page's own
origin, so the admin loads there and then shows no collections. Everything is
proxied through 3000; 4001 does not need to be forwarded at all.

**On a normal machine both work.** Every port shares `localhost`, so Tina's
default content API URL is fine and nothing is overridden: open either
`http://localhost:4001/admin/` or `http://localhost:3000/admin/index.html`.
They edit the same files. (`http://localhost:4001/` redirects to `/admin/` —
that is Tina's own dev server, not this setup.)

Nothing about that hostname is hardcoded — GitHub generates it per codespace, so
`dev/urls.js` derives it from `CODESPACE_NAME` and
`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` at startup and falls back to
`http://localhost:3000` outside a codespace.

**No port needs to be public.** The Tina GraphQL server stays bound to
`localhost:4001`; the Docusaurus dev server proxies `/graphql`, `/media`,
`/searchIndex` and Vite's admin module graph through to it
(`dev/tina-proxy-plugin.js`). The browser only ever talks to port 3000, which
stays *private* and behind GitHub's own Codespaces port authentication — so the
backend is reachable by you and nobody else, with no shared secret to leak or
rotate. Leave port 4001 private; making it public would expose an unauthenticated
read/write content API.

## Publishing an edit

1. `yarn tina`, open the admin, edit a page and save. Tina writes straight to
   the `.mdx` file on disk.
2. Open **Publish** in the admin sidebar, give the change a title, and hit
   Publish.

That commits everything changed under `docs/`, `blog/` and `static/` to a fresh
`tina/…` branch, pushes it, and opens a pull request with `gh`. Unrelated
working-tree changes are left alone. Afterwards the checkout returns to the
branch you started from, so the local preview shows what is actually published —
your edit lives in the PR until it is merged.

The endpoint behind that button (`dev/publish-server.js`) runs `git` and `gh`
with the codespace's credentials. It is bound to loopback, is only reachable
through the dev server's proxy, and is never started for a production build.

## Deploying

`.github/workflows/deploy-docs.yml` builds the site and deploys it to GitHub
Pages on every push to `main`; pull requests only build, so a bad edit fails
before it is merged. The first run enables Pages itself.

The site is published at `https://ggcaponetto.github.io/docusaurus-tina-poc/`,
so `baseUrl` is `/docusaurus-tina-poc/` for production builds and `/` in dev —
the dev server and the Tina admin proxied through it are simplest at the root.
