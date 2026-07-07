import { describe, expect, it } from "vitest";

import type { ThreadNode, ThreadViewPost } from "./appviewTypes.js";
import { ThreadUnavailableError, normalizeThread } from "./commentTree.js";

const post = (
  handle: string,
  rkey: string,
  text: string,
  overrides: Partial<ThreadViewPost["post"]> = {},
): ThreadViewPost["post"] => ({
  uri: `at://did:plc:${handle}/app.bsky.feed.post/${rkey}`,
  cid: `cid-${rkey}`,
  author: {
    did: `did:plc:${handle}`,
    handle: `${handle}.test`,
    displayName: handle,
    avatar: `https://cdn.example/${handle}.jpg`,
  },
  record: {
    $type: "app.bsky.feed.post",
    text,
    createdAt: "2026-07-01T12:00:00.000Z",
  },
  replyCount: 0,
  likeCount: 0,
  repostCount: 0,
  quoteCount: 0,
  indexedAt: "2026-07-01T12:00:01.000Z",
  labels: [],
  ...overrides,
});

// a representative thread: nested replies, blocked + not-found tombstones,
// a depth-truncated branch, and a labeled post
const fixture: ThreadNode = {
  $type: "app.bsky.feed.defs#threadViewPost",
  post: post("author", "root", "the blog post announcement", {
    replyCount: 4,
    likeCount: 42,
    repostCount: 7,
    quoteCount: 3,
  }),
  replies: [
    {
      $type: "app.bsky.feed.defs#threadViewPost",
      post: post("alice", "c1", "great post!", { likeCount: 5, replyCount: 1 }),
      replies: [
        {
          $type: "app.bsky.feed.defs#threadViewPost",
          post: post("author", "c1r1", "thanks!"),
          replies: [],
        },
      ],
    },
    {
      $type: "app.bsky.feed.defs#blockedPost",
      uri: "at://did:plc:blocked/app.bsky.feed.post/c2",
      blocked: true,
      author: { did: "did:plc:blocked" },
    },
    {
      $type: "app.bsky.feed.defs#notFoundPost",
      uri: "at://did:plc:gone/app.bsky.feed.post/c3",
      notFound: true,
    },
    {
      $type: "app.bsky.feed.defs#threadViewPost",
      // replyCount says 2, but no replies were fetched → depth-truncated
      post: post("deep", "c4", "reply at the depth limit", {
        replyCount: 2,
        labels: [
          { src: "did:plc:labeler", val: "spam" },
          { src: "did:plc:labeler", val: "negated", neg: true },
        ],
      }),
    },
  ],
};

describe("normalizeThread", () => {
  it("builds the root summary with counts and permalink", () => {
    const tree = normalizeThread(fixture);
    expect(tree.root).toMatchObject({
      uri: "at://did:plc:author/app.bsky.feed.post/root",
      replyCount: 4,
      likeCount: 42,
      repostCount: 7,
      quoteCount: 3,
      url: "https://bsky.app/profile/author.test/post/root",
    });
    expect(tree.root.author.profileUrl).toBe(
      "https://bsky.app/profile/author.test",
    );
    expect(Date.parse(tree.fetchedAt)).not.toBeNaN();
  });

  it("normalizes nested replies preserving structure", () => {
    const tree = normalizeThread(fixture);
    expect(tree.comments).toHaveLength(4);

    const first = tree.comments[0];
    expect(first).toMatchObject({
      kind: "comment",
      text: "great post!",
      likeCount: 5,
      hasMoreReplies: false,
      url: "https://bsky.app/profile/alice.test/post/c1",
    });
    if (first?.kind !== "comment") throw new Error("expected comment");
    expect(first.replies).toHaveLength(1);
    expect(first.replies[0]).toMatchObject({
      kind: "comment",
      text: "thanks!",
    });
  });

  it("maps blocked and not-found nodes to tombstones", () => {
    const tree = normalizeThread(fixture);
    expect(tree.comments[1]).toEqual({
      kind: "blocked",
      uri: "at://did:plc:blocked/app.bsky.feed.post/c2",
    });
    expect(tree.comments[2]).toEqual({
      kind: "not-found",
      uri: "at://did:plc:gone/app.bsky.feed.post/c3",
    });
  });

  it("flags depth-truncated branches and keeps non-negated labels", () => {
    const tree = normalizeThread(fixture);
    const truncated = tree.comments[3];
    if (truncated?.kind !== "comment") throw new Error("expected comment");
    expect(truncated.hasMoreReplies).toBe(true);
    expect(truncated.replies).toHaveLength(0);
    expect(truncated.labels).toEqual(["spam"]);
  });

  it("tolerates a malformed record", () => {
    const tree = normalizeThread({
      $type: "app.bsky.feed.defs#threadViewPost",
      post: post("weird", "x", "ignored", { record: { something: "else" } }),
    });
    expect(tree.root.uri).toContain("did:plc:weird");
    expect(tree.comments).toEqual([]);
  });

  it("throws ThreadUnavailableError for a blocked root", () => {
    expect(() =>
      normalizeThread({
        $type: "app.bsky.feed.defs#blockedPost",
        uri: "at://did:plc:x/app.bsky.feed.post/y",
        blocked: true,
      }),
    ).toThrowError(ThreadUnavailableError);
  });

  it("throws ThreadUnavailableError for a not-found root", () => {
    expect(() =>
      normalizeThread({
        $type: "app.bsky.feed.defs#notFoundPost",
        uri: "at://did:plc:x/app.bsky.feed.post/y",
        notFound: true,
      }),
    ).toThrowError(ThreadUnavailableError);
  });
});
