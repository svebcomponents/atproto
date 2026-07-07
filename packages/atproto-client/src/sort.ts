import type { Comment, CommentNode } from "./commentTree.js";

export type CommentSort = "oldest" | "newest" | "likes";

const timestamp = (node: CommentNode): number =>
  node.kind === "comment" ? Date.parse(node.createdAt) || 0 : 0;

const likes = (node: CommentNode): number =>
  node.kind === "comment" ? node.likeCount : 0;

const comparators: Record<
  CommentSort,
  (a: CommentNode, b: CommentNode) => number
> = {
  oldest: (a, b) => timestamp(a) - timestamp(b),
  newest: (a, b) => timestamp(b) - timestamp(a),
  likes: (a, b) => likes(b) - likes(a) || timestamp(a) - timestamp(b),
};

/**
 * Returns a recursively sorted copy of the comment list (the input is not
 * mutated). Tombstones keep their relative position at the end of ties.
 */
export const sortComments = (
  nodes: CommentNode[],
  sort: CommentSort,
): CommentNode[] =>
  nodes
    .map((node) =>
      node.kind === "comment"
        ? ({ ...node, replies: sortComments(node.replies, sort) } as Comment)
        : node,
    )
    .sort(comparators[sort]);
