import { fetchCommentTree, type CommentTree } from "@atproto-comments/client";
import type { PageServerLoad } from "./$types";

// @bsky.app's v1.125 release announcement — a lively thread with mentions,
// links, and tags. Override with ?thread=<at-uri or bsky.app URL>.
const DEFAULT_THREAD =
  "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3mojb23vtt22c";

export const load: PageServerLoad = async ({ url, fetch }) => {
  const thread = url.searchParams.get("thread") ?? DEFAULT_THREAD;

  // Tier 1 preloading: fetch on the server so the page SSRs with the full
  // thread and the client hydrates without refetching. On failure we fall
  // back to Tier 3 (the component fetches client-side).
  let threadData: CommentTree | null = null;
  try {
    threadData = await fetchCommentTree(thread, { fetch, depth: 10 });
  } catch (error) {
    console.error("server-side thread prefetch failed:", error);
  }

  return { thread, threadData };
};
