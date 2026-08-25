import { describe, expect, it } from "vitest";

import type { CommentNode, CommentTree } from "@svebcomponents/atproto.client";
import {
  adoptViewerState,
  reactionCount,
  viewerLookupSubjects,
} from "./viewerState.js";

const rootUri = "at://did:plc:root/app.bsky.feed.post/root";

const comment = (
  uri: string,
  counts: { likeCount?: number; repostCount?: number; quoteCount?: number } = {
    likeCount: 1,
  },
  replies: CommentNode[] = [],
): CommentNode =>
  ({
    kind: "comment",
    uri,
    cid: `${uri}-cid`,
    author: {
      did: "did:plc:author",
      handle: "author.test",
      profileUrl: "https://bsky.app/profile/author.test",
    },
    text: uri,
    segments: [{ type: "text", text: uri }],
    createdAt: "2026-07-24T00:00:00.000Z",
    likeCount: counts.likeCount ?? 0,
    replyCount: replies.length,
    repostCount: counts.repostCount ?? 0,
    quoteCount: counts.quoteCount ?? 0,
    labels: [],
    url: "https://bsky.app",
    replies,
    hasMoreReplies: false,
  }) satisfies CommentNode;

const tree = (
  comments: CommentNode[] = [],
  rootCounts: {
    likeCount?: number;
    repostCount?: number;
    quoteCount?: number;
  } = {},
): CommentTree =>
  ({
    root: {
      uri: rootUri,
      cid: "root-cid",
      author: {
        did: "did:plc:root",
        handle: "root.test",
        profileUrl: "https://bsky.app/profile/root.test",
      },
      text: "the root post",
      segments: [{ type: "text", text: "the root post" }],
      createdAt: "2026-07-24T00:00:00.000Z",
      replyCount: comments.length,
      likeCount: rootCounts.likeCount ?? 0,
      repostCount: rootCounts.repostCount ?? 0,
      quoteCount: rootCounts.quoteCount ?? 0,
      url: "https://bsky.app",
    },
    comments,
    fetchedAt: "2026-07-24T00:00:00.000Z",
  }) satisfies CommentTree;

describe("viewerLookupSubjects", () => {
  it("walks the root and every nested reply", () => {
    expect(
      viewerLookupSubjects(
        tree([comment("a", { likeCount: 2 }, [comment("a1"), comment("a2")])], {
          likeCount: 1,
        }),
      ).likes,
    ).toEqual([rootUri, "a", "a1", "a2"]);
  });

  it("skips posts nobody has reacted to — the reader cannot be among no one", () => {
    const subjects = viewerLookupSubjects(
      tree([
        comment("liked", { likeCount: 3 }),
        comment("untouched", { likeCount: 0 }),
        comment("reposted", { likeCount: 0, repostCount: 1 }),
      ]),
    );
    expect(subjects).toEqual({ likes: ["liked"], reposts: ["reposted"] });
  });

  it("counts a quote as a reason to check for a repost", () => {
    const subjects = viewerLookupSubjects(
      tree([comment("quoted", { likeCount: 0, quoteCount: 2 })]),
    );
    expect(subjects.reposts).toEqual(["quoted"]);
  });

  it("skips tombstones, which have no post to react to", () => {
    const blocked = { kind: "blocked", uri: "b" } as unknown as CommentNode;
    expect(viewerLookupSubjects(tree([blocked, comment("a")])).likes).toEqual([
      "a",
    ]);
  });

  it("spends its lookup budget across both reaction kinds", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      comment(`c${i}`, { likeCount: 1, repostCount: 1 }),
    );
    const { likes, reposts } = viewerLookupSubjects(tree(many), 10);
    expect(likes.length + reposts.length).toBe(10);
  });
});

describe("reactionCount", () => {
  const uri = "at://post";

  it("leaves an untouched post's count alone", () => {
    expect(reactionCount(7, {}, {}, uri)).toBe(7);
  });

  it("adds a like the AppView has not tallied yet", () => {
    expect(reactionCount(7, { [uri]: "at://like" }, {}, uri)).toBe(8);
  });

  it("does not double-count a like the AppView already reports", () => {
    // the regression: the fetched total includes this reader's own like
    expect(
      reactionCount(8, { [uri]: "at://like" }, { [uri]: "at://like" }, uri),
    ).toBe(8);
  });

  it("subtracts an unlike the AppView has not caught up with", () => {
    expect(reactionCount(8, {}, { [uri]: "at://like" }, uri)).toBe(7);
  });

  it("never renders a negative count", () => {
    expect(reactionCount(0, {}, { [uri]: "at://like" }, uri)).toBe(0);
  });
});

describe("adoptViewerState", () => {
  it("takes the bridge's answer for untouched posts", () => {
    expect(adoptViewerState({ a: "at://like-a" }, {}, new Set())).toEqual({
      a: "at://like-a",
    });
  });

  it("keeps a like made while the lookup was in flight", () => {
    expect(adoptViewerState({}, { a: "at://fresh" }, new Set(["a"]))).toEqual({
      a: "at://fresh",
    });
  });

  it("keeps an unlike made while the lookup was in flight", () => {
    // the bridge still reports the like; the reader has already removed it
    expect(adoptViewerState({ a: "at://stale" }, {}, new Set(["a"]))).toEqual(
      {},
    );
  });

  it("does not let a touched post mask the others", () => {
    expect(
      adoptViewerState(
        { a: "at://like-a", b: "at://like-b" },
        { b: "at://like-b" },
        new Set(["b"]),
      ),
    ).toEqual({ a: "at://like-a", b: "at://like-b" });
  });
});
