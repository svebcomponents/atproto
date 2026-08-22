import { fetchCommentTree } from "@svebcomponents/atproto.client";
import type { PageServerLoad } from "./$types";
import { getService } from "$lib/server/service.js";

const DEFAULT_THREAD =
  "at://did:plc:nsmlf6uhdg2onrsrdr7oiyv4/app.bsky.feed.post/3mreni33v7k2c";

export const load: PageServerLoad = async ({ url }) => {
  const thread = url.searchParams.get("thread") ?? DEFAULT_THREAD;

  // Counts only, and never the origins themselves — which sites embed the
  // component is their business, not this page's. See metrics.ts.
  const stats = await getService()
    .stats()
    .catch(() => null);

  try {
    return {
      thread,
      stats,
      threadData: await fetchCommentTree(thread),
    };
  } catch (error) {
    console.error("Documentation demo prefetch failed:", error);
    return { thread, stats, threadData: null };
  }
};
