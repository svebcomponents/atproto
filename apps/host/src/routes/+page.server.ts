import { fetchCommentTree } from "@svebcomponents/atproto.client";
import type { PageServerLoad } from "./$types";

const DEFAULT_THREAD =
  "at://did:plc:nsmlf6uhdg2onrsrdr7oiyv4/app.bsky.feed.post/3mreni33v7k2c";

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
