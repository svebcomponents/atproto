import { describe, expect, it } from "vitest";

import type { CommentNode } from "./commentTree.js";
import { sortComments } from "./sort.js";

const comment = (
  rkey: string,
  {
    createdAt,
    likeCount = 0,
    replies = [],
  }: { createdAt: string; likeCount?: number; replies?: CommentNode[] },
): Extract<CommentNode, { kind: "comment" }> => ({
  kind: "comment",
  uri: `at://did:plc:a/app.bsky.feed.post/${rkey}`,
  cid: `cid-${rkey}`,
  author: {
    did: "did:plc:a",
    handle: "a.test",
    profileUrl: "https://bsky.app/profile/a.test",
  },
  text: rkey,
  segments: [{ type: "text", text: rkey }],
  createdAt,
  likeCount,
  replyCount: replies.length,
  repostCount: 0,
  quoteCount: 0,
  labels: [],
  url: "https://bsky.app/profile/a.test/post/x",
  replies,
  hasMoreReplies: false,
});

const tombstone = (kind: "blocked" | "not-found"): CommentNode => ({
  kind,
  uri: "at://did:plc:b/app.bsky.feed.post/gone",
});

const nodes: CommentNode[] = [
  comment("new", { createdAt: "2026-07-03T00:00:00.000Z", likeCount: 1 }),
  comment("old", { createdAt: "2026-07-01T00:00:00.000Z", likeCount: 5 }),
  tombstone("blocked"),
];

const uris = (sorted: CommentNode[]): string[] => sorted.map(nodeLabel);

const nodeLabel = (node: CommentNode): string =>
  node.kind === "comment" ? node.text : node.kind;

describe("sortComments", () => {
  it("sorts oldest first", () => {
    // tombstones carry no timestamp (epoch 0), so they lead under "oldest"
    expect(uris(sortComments(nodes, "oldest"))).toEqual([
      "blocked",
      "old",
      "new",
    ]);
  });

  it("sorts newest first, tombstones last", () => {
    expect(uris(sortComments(nodes, "newest"))).toEqual([
      "new",
      "old",
      "blocked",
    ]);
  });

  it("sorts by likes with timestamp as tiebreaker", () => {
    const input = [
      comment("b", { createdAt: "2026-07-02T00:00:00.000Z", likeCount: 2 }),
      comment("a", { createdAt: "2026-07-01T00:00:00.000Z", likeCount: 2 }),
      comment("c", { createdAt: "2026-07-01T00:00:00.000Z", likeCount: 9 }),
    ];
    expect(uris(sortComments(input, "likes"))).toEqual(["c", "a", "b"]);
  });

  it("sorts nested replies at every depth and does not mutate the input", () => {
    const inner = [
      comment("deep-new", { createdAt: "2026-07-04T00:00:00.000Z" }),
      comment("deep-old", { createdAt: "2026-07-02T00:00:00.000Z" }),
    ];
    const parent = comment("parent", {
      createdAt: "2026-07-01T00:00:00.000Z",
      replies: inner,
    });
    const input = [parent];
    const [sortedParent] = sortComments(input, "oldest");
    if (sortedParent?.kind !== "comment") throw new Error("expected a comment");

    expect(sortedParent.replies.map(nodeLabel)).toEqual([
      "deep-old",
      "deep-new",
    ]);
    // the original tree is untouched
    expect(inner.map(nodeLabel)).toEqual(["deep-new", "deep-old"]);
  });
});
