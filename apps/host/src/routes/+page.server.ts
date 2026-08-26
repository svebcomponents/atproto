import { fetchCommentTree } from "@svebcomponents/atproto.client";
import type { PageServerLoad } from "./$types";
import { getService } from "$lib/server/service.js";
import { snippets } from "$lib/server/snippets.js";

const DEFAULT_THREAD =
  "at://did:plc:622i7tyw4hryjfdiuhsogk35/app.bsky.feed.post/3mtyiwccn5s2j";

export const load: PageServerLoad = async ({ url }) => {
  const thread = url.searchParams.get("thread") ?? DEFAULT_THREAD;

  // Counts only, and never the origins themselves — which sites embed the
  // component is their business, not this page's.
  // See packages/service-core/src/metrics.ts.
  const stats = await getService()
    .stats()
    .catch(() => null);

  try {
    return {
      thread,
      stats,
      snippets,
      threadData: await fetchCommentTree(thread),
      // when the snapshot was taken, so the client can skip its mount-time
      // revalidation while this data is still inside the component's
      // staleTime window
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error("Documentation demo prefetch failed:", error);
    return { thread, stats, snippets, threadData: null, fetchedAt: null };
  }
};
