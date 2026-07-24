import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommentNode, CommentTree } from "@svebcomponents/atproto.client";
import {
  LiveRefreshScheduler,
  reconcileOptimisticReplies,
  RefreshCoordinator,
  treeContainsUri,
} from "./revalidation.js";

const rootUri = "at://did:plc:root/app.bsky.feed.post/root";

const comment = (uri: string, replies: CommentNode[] = []): CommentNode =>
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
    likeCount: 0,
    replyCount: replies.length,
    labels: [],
    url: "https://bsky.app",
    replies,
    hasMoreReplies: false,
  }) satisfies CommentNode;

const tree = (comments: CommentNode[] = []): CommentTree =>
  ({
    root: {
      uri: rootUri,
      cid: "root-cid",
      author: {
        did: "did:plc:root",
        handle: "root.test",
        profileUrl: "https://bsky.app/profile/root.test",
      },
      replyCount: comments.length,
      likeCount: 0,
      repostCount: 0,
      quoteCount: 0,
      url: "https://bsky.app",
    },
    comments,
    fetchedAt: "2026-07-24T00:00:00.000Z",
  }) satisfies CommentTree;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RefreshCoordinator", () => {
  it("deduplicates concurrent refreshes", async () => {
    const coordinator = new RefreshCoordinator<string>();
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);
    const resolved = vi.fn();

    const first = coordinator.run("thread", load, { resolved });
    const second = coordinator.run("thread", load, { resolved });
    expect(second).toBe(first);

    pending.resolve("current");
    await expect(first).resolves.toBe("current");
    expect(load).toHaveBeenCalledOnce();
    expect(resolved).toHaveBeenCalledOnce();
  });

  it("aborts changed requests and ignores their late responses", async () => {
    const coordinator = new RefreshCoordinator<string>();
    const oldRequest = deferred<string>();
    const newRequest = deferred<string>();
    const applied: string[] = [];
    let oldSignal: AbortSignal | undefined;

    const oldResult = coordinator.run(
      "old-thread",
      (signal) => {
        oldSignal = signal;
        return oldRequest.promise;
      },
      { resolved: (value) => applied.push(value) },
    );
    await Promise.resolve();

    const newResult = coordinator.run("new-thread", () => newRequest.promise, {
      resolved: (value) => applied.push(value),
    });
    expect(oldSignal?.aborted).toBe(true);

    newRequest.resolve("new");
    await expect(newResult).resolves.toBe("new");
    oldRequest.resolve("old");
    await expect(oldResult).resolves.toBeUndefined();
    expect(applied).toEqual(["new"]);
  });
});

describe("optimistic replies", () => {
  it("keeps replies until their URI occurs anywhere in the fetched tree", () => {
    const optimisticReply = comment("at://did:plc:me/app.bsky.feed.post/reply");
    const optimistic = { [rootUri]: [optimisticReply] };
    const absent = tree();

    expect(reconcileOptimisticReplies(absent, optimistic)).toBe(optimistic);
    expect(treeContainsUri(absent, optimisticReply.uri)).toBe(false);

    const indexed = tree([
      comment("at://did:plc:other/app.bsky.feed.post/parent", [
        optimisticReply,
      ]),
    ]);
    expect(reconcileOptimisticReplies(indexed, optimistic)).toEqual({});
    expect(treeContainsUri(indexed, optimisticReply.uri)).toBe(true);
  });

  it("removes indexed replies without dropping other pending replies", () => {
    const indexed = comment("at://did:plc:me/app.bsky.feed.post/indexed");
    const pending = comment("at://did:plc:me/app.bsky.feed.post/pending");

    expect(
      reconcileOptimisticReplies(tree([indexed]), {
        [rootUri]: [indexed, pending],
      }),
    ).toEqual({ [rootUri]: [pending] });
  });
});

describe("LiveRefreshScheduler", () => {
  it("synchronizes once when the upstream connection becomes current", async () => {
    const refresh = vi.fn().mockResolvedValue(tree());
    const scheduler = new LiveRefreshScheduler(refresh, [0]);

    scheduler.synchronize();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("coalesces comment events and stops when their URIs are visible", async () => {
    const first = comment("at://did:plc:a/app.bsky.feed.post/one");
    const second = comment("at://did:plc:b/app.bsky.feed.post/two");
    const refresh = vi.fn().mockResolvedValue(tree([first, second]));
    const scheduler = new LiveRefreshScheduler(refresh, [0, 10]);

    scheduler.synchronize(first.uri);
    scheduler.synchronize(second.uri);

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("retries while an event is not yet visible through the AppView", async () => {
    vi.useFakeTimers();
    const posted = comment("at://did:plc:a/app.bsky.feed.post/delayed");
    const refresh = vi
      .fn<() => Promise<CommentTree>>()
      .mockResolvedValueOnce(tree())
      .mockResolvedValueOnce(tree([posted]));
    const scheduler = new LiveRefreshScheduler(refresh, [0, 500]);

    scheduler.synchronize(posted.uri);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("runs a trailing refresh for an event received during a fetch", async () => {
    const inFlight = deferred<CommentTree>();
    const posted = comment("at://did:plc:a/app.bsky.feed.post/trailing");
    const refresh = vi
      .fn<() => Promise<CommentTree>>()
      .mockReturnValueOnce(inFlight.promise)
      .mockResolvedValueOnce(tree([posted]));
    const scheduler = new LiveRefreshScheduler(refresh, [0]);

    scheduler.synchronize();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    scheduler.synchronize(posted.uri);
    inFlight.resolve(tree());

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });
});
