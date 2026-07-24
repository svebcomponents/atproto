import { fetchCommentTree } from "@svebcomponents/atproto.client";
import type { PageServerLoad } from "./$types";

const DEFAULT_THREAD =
  "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3mojb23vtt22c";

export const load: PageServerLoad = async ({ url }) => {
  const thread = url.searchParams.get("thread") ?? DEFAULT_THREAD;

  try {
    return {
      thread,
      threadData: await fetchCommentTree(thread),
    };
  } catch (error) {
    console.error("Documentation demo prefetch failed:", error);
    return { thread, threadData: null };
  }
};
