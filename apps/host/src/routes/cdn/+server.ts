import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// No version pinned: forward to the unpinned jsDelivr URL, which jsDelivr
// itself resolves to the latest published release.
export const GET: RequestHandler = () => {
  redirect(
    302,
    "https://cdn.jsdelivr.net/npm/@svebcomponents/atproto.comments",
  );
};
