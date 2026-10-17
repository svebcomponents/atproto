import { describe, expect, it } from "vitest";

import type { CommentNode, CommentTree } from "@svebcomponents/atproto.client";
import { repliesToggleLabel, snapshotHasReplies } from "./replies.js";

const tree = (replyCount: number, comments: CommentNode[] = []): CommentTree =>
  ({
    root: { uri: "at://example/root", replyCount },
    comments,
    fetchedAt: "2026-10-17T00:00:00.000Z",
  }) as CommentTree;

const reply = { kind: "not-found", uri: "at://example/reply" } as const;

describe("snapshotHasReplies", () => {
  it("treats a root-only snapshot of a replied-to post as not loaded", () => {
    expect(snapshotHasReplies(tree(3))).toBe(false);
  });

  it("accepts snapshots that contain replies", () => {
    expect(snapshotHasReplies(tree(3, [reply]))).toBe(true);
  });

  it("accepts a root without replies as complete", () => {
    expect(snapshotHasReplies(tree(0))).toBe(true);
  });
});

describe("repliesToggleLabel", () => {
  const format = (count: number) => `${count}`;

  it("names the reply count while collapsed", () => {
    expect(repliesToggleLabel(1, false, format)).toBe("Show 1 reply");
    expect(repliesToggleLabel(12, false, format)).toBe("Show 12 replies");
  });

  it("offers to hide replies while expanded", () => {
    expect(repliesToggleLabel(12, true, format)).toBe("Hide replies");
  });
});
