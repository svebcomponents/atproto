import {
  MAX_VIEWER_SUBJECTS,
  type CommentNode,
  type CommentTree,
  type ViewerSubjects,
} from "@svebcomponents/atproto.client";

/**
 * Which posts are worth asking the bridge about, and for what.
 *
 * Each subject costs one backlink lookup, so a post nobody has liked is
 * skipped: its public count is zero, and the reader cannot be among no one.
 * That is what keeps a comment thread — where most replies have no reactions
 * at all — down to a handful of lookups instead of two per post.
 *
 * A count the AppView has not caught up on can hide a very recent reaction
 * from this pass. The next refresh sees it, and a reaction made in this tab
 * is already tracked locally, so nothing the reader did here is at stake.
 */
export const viewerLookupSubjects = (
  source: CommentTree,
  limit: number = MAX_VIEWER_SUBJECTS,
): ViewerSubjects => {
  const likes: string[] = [];
  const reposts: string[] = [];
  let budget = limit;

  const consider = (post: {
    uri: string;
    likeCount: number;
    repostCount: number;
    quoteCount: number;
  }) => {
    if (budget > 0 && post.likeCount > 0) {
      likes.push(post.uri);
      budget -= 1;
    }
    if (budget > 0 && post.repostCount + post.quoteCount > 0) {
      reposts.push(post.uri);
      budget -= 1;
    }
  };

  consider(source.root);
  const visit = (nodes: readonly CommentNode[]) => {
    for (const node of nodes) {
      // tombstones (blocked/not-found) have no post to have reacted to
      if (node.kind !== "comment") continue;
      consider(node);
      visit(node.replies);
    }
  };
  visit(source.comments);
  return { likes, reposts };
};

/**
 * A reaction count as it should read on screen.
 *
 * `total` comes from the public AppView and already includes this reader's
 * own reactions — `base` is the subset of them the bridge confirmed, so only
 * a toggle nothing upstream has tallied yet moves the number. Adding one for
 * every filled heart instead is what made a like appear to vanish on reload:
 * the +1 was local, the count underneath had already absorbed it.
 */
export const reactionCount = (
  total: number,
  current: Record<string, string>,
  base: Record<string, string>,
  uri: string,
): number => Math.max(0, total - (base[uri] ? 1 : 0) + (current[uri] ? 1 : 0));

/**
 * The bridge's view of the reader's reactions, overruled for posts they
 * toggled locally since — a lookup that was in flight when they clicked
 * answers as if the click never happened, and must not undo it.
 */
export const adoptViewerState = (
  remote: Record<string, string>,
  local: Record<string, string>,
  touched: ReadonlySet<string>,
): Record<string, string> => {
  const next = { ...remote };
  for (const uri of touched) {
    // absent locally is a state ("un-reacted here"), not a gap
    if (local[uri]) next[uri] = local[uri];
    else delete next[uri];
  }
  return next;
};
