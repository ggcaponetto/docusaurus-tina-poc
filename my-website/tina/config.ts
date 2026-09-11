import { defineConfig } from "tinacms";
import { contentApiUrl, siteOrigin } from "../dev/urls";
import { publishScreenPlugin } from "./publish-screen";

// Your hosting provider likely exposes this as an environment variable
const branch =
  process.env.GITHUB_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.HEAD ||
  "main";

// Set by the `tina` npm script.
const isDevProxy = process.env.TINA_DEV_PROXY === "1";

export default defineConfig({
  branch,
  // Only set while `yarn tina` is running: the admin then talks to the
  // Docusaurus dev server's own origin, which proxies through to the Tina
  // server on localhost:4001. A production build must keep this unset.
  contentApiUrlOverride: isDevProxy ? contentApiUrl() : undefined,
  // Get this from tina.io
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID,
  // Get this from tina.io
  token: process.env.TINA_TOKEN,

  build: {
    outputFolder: "admin",
    publicFolder: "static",
  },
  // Adds the "Publish" screen to the admin sidebar. It calls a dev-only
  // endpoint, so it is registered only while `yarn tina` is running.
  cmsCallback: (cms) => {
    if (isDevProxy) {
      cms.plugins.add(publishScreenPlugin);
    }
    return cms;
  },
  // Writes arrive proxied from the Docusaurus dev server, so they carry that
  // origin rather than localhost; without this Tina rejects them with 403.
  server: {
    allowedOrigins: isDevProxy ? [siteOrigin()] : [],
  },
  media: {
    tina: {
      mediaRoot: "",
      publicFolder: "static",
    },
  },
  // See docs on content modeling for more info on how to setup new content models: https://tina.io/docs/r/content-modelling-collections/
  schema: {
    collections: [
      {
        name: "docs",
        label: "Docs",
        path: "docs",
        // Every file under docs/ is .mdx. Tina's default is "md", which is why
        // the collection came up empty.
        format: "mdx",
        fields: [
          // Docusaurus takes the page title from the first heading in the body,
          // so `title` is optional here and cannot be the collection's isTitle
          // field (Tina requires those to be required).
          {
            type: "string",
            name: "title",
            label: "Title",
          },
          {
            type: "string",
            name: "description",
            label: "Description",
          },
          {
            type: "string",
            name: "sidebar_label",
            label: "Sidebar label",
          },
          {
            type: "number",
            name: "sidebar_position",
            label: "Sidebar position",
          },
          {
            type: "string",
            name: "slug",
            label: "Slug",
          },
          {
            type: "string",
            name: "tags",
            label: "Tags",
            list: true,
          },
          {
            type: "rich-text",
            name: "body",
            label: "Body",
            isBody: true,
          },
        ],
      },
    ],
  },
});
