import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Short, stable CDN alias so docs/snippets can reference
// atproto.svebcomponents.dev/cdn@<version> instead of the jsDelivr URL
// directly. `<version>` is validated by the `version` param matcher
// (src/params/version.ts) before it is forwarded to jsDelivr.
export const GET: RequestHandler = ({ params }) => {
  redirect(
    302,
    `https://cdn.jsdelivr.net/npm/@svebcomponents/atproto.comments@${params.version}`,
  );
};
