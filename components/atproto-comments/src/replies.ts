import type { CommentTree } from "@svebcomponents/atproto.client";

/**
 * How the root's replies are presented.
 *
 * - `"expanded"` (default) — the comment section: replies render inline.
 * - `"collapsed"` — a post card: replies stay behind a toggle and are only
 *   fetched once the reader opens them.
 */
export type RepliesMode = "expanded" | "collapsed";

/** reply depth fetched while replies are collapsed: the root post only */
export const COLLAPSED_FETCH_DEPTH = 0;

/**
 * Whether a snapshot already holds the root's replies.
 *
 * A root-only snapshot (fetched while collapsed, or supplied that way by the
 * host) has no comments although the root has replies. That is "not loaded",
 * not "no replies", and must not render as an empty thread. A root without
 * replies is complete either way.
 */
export const snapshotHasReplies = (tree: CommentTree): boolean =>
  tree.comments.length > 0 || tree.root.replyCount === 0;

/** the collapsed-replies toggle's text */
export const repliesToggleLabel = (
  count: number,
  expanded: boolean,
  formatCount: (count: number) => string,
): string => {
  if (expanded) return "Hide replies";
  return count === 1 ? "Show 1 reply" : `Show ${formatCount(count)} replies`;
};
