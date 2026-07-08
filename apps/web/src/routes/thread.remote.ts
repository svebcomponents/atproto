import { query } from "$app/server";
import * as v from "valibot";
import { fetchCommentTree, type CommentTree } from "@atproto-comments/client";

/**
 * Server-side thread prefetch as a SvelteKit remote function. Called during
 * SSR from +page.svelte so the component renders with `threadData` already
 * populated (Tier 1: no client refetch, no flash). Returns null on failure so
 * the component gracefully falls back to fetching client-side (Tier 3).
 *
 * The argument is validated with a Standard Schema (valibot); the return
 * value is serialized to the client with devalue.
 */
export const getThread = query(
  v.pipe(v.string(), v.minLength(1)),
  async (thread: string): Promise<CommentTree | null> => {
    try {
      return await fetchCommentTree(thread, { depth: 10 });
    } catch (error) {
      console.error("thread prefetch failed:", error);
      return null;
    }
  },
);
