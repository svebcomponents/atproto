import { describe, expect, it, vi } from "vitest";

import {
  AppViewError,
  fetchCommentTree,
  getPostThread,
  resolveThreadUri,
} from "./fetchThread.js";
import { parseThreadRef } from "./threadRef.js";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const minimalThread = {
  thread: {
    $type: "app.bsky.feed.defs#threadViewPost",
    post: {
      uri: "at://did:plc:abc/app.bsky.feed.post/xyz",
      cid: "bafy",
      author: { did: "did:plc:abc", handle: "alice.test" },
      record: {
        $type: "app.bsky.feed.post",
        text: "hello",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      replyCount: 0,
    },
    replies: [],
  },
};

describe("getPostThread", () => {
  it("requests the right XRPC endpoint with params", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(minimalThread));
    await getPostThread("at://did:plc:abc/app.bsky.feed.post/xyz", {
      fetch,
      depth: 8,
    });

    const url = new URL(fetch.mock.calls[0]![0] as URL);
    expect(url.origin).toBe("https://public.api.bsky.app");
    expect(url.pathname).toBe("/xrpc/app.bsky.feed.getPostThread");
    expect(url.searchParams.get("uri")).toBe(
      "at://did:plc:abc/app.bsky.feed.post/xyz",
    );
    expect(url.searchParams.get("depth")).toBe("8");
    expect(url.searchParams.get("parentHeight")).toBe("0");
  });

  it("honors a custom appView base", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(minimalThread));
    await getPostThread("at://x/app.bsky.feed.post/y", {
      fetch,
      appView: "https://appview.example",
    });
    expect(new URL(fetch.mock.calls[0]![0] as URL).origin).toBe(
      "https://appview.example",
    );
  });

  it("maps structured errors to AppViewError", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: "NotFound", message: "Post not found" }, 400),
      );
    const failure = getPostThread("at://x/app.bsky.feed.post/y", { fetch });
    await expect(failure).rejects.toBeInstanceOf(AppViewError);
    await expect(failure).rejects.toMatchObject({
      status: 400,
      code: "NotFound",
      message: "Post not found",
    });
  });

  it("survives non-JSON error bodies", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("bad gateway", { status: 502 }));
    await expect(
      getPostThread("at://x/app.bsky.feed.post/y", { fetch }),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe("resolveThreadUri", () => {
  it("passes through DID-authority refs without a network call", async () => {
    const fetch = vi.fn();
    const ref = parseThreadRef("at://did:plc:abc/app.bsky.feed.post/xyz");
    expect(await resolveThreadUri(ref!, { fetch })).toBe(
      "at://did:plc:abc/app.bsky.feed.post/xyz",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves handle authorities via resolveHandle", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ did: "did:plc:resolved" }));
    const ref = parseThreadRef("https://bsky.app/profile/alice.test/post/xyz");
    expect(await resolveThreadUri(ref!, { fetch })).toBe(
      "at://did:plc:resolved/app.bsky.feed.post/xyz",
    );
    const url = new URL(fetch.mock.calls[0]![0] as URL);
    expect(url.pathname).toBe("/xrpc/com.atproto.identity.resolveHandle");
    expect(url.searchParams.get("handle")).toBe("alice.test");
  });
});

describe("fetchCommentTree", () => {
  it("parses, fetches, and normalizes in one call", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(minimalThread));
    const tree = await fetchCommentTree(
      "at://did:plc:abc/app.bsky.feed.post/xyz",
      { fetch },
    );
    expect(tree.root.uri).toBe("at://did:plc:abc/app.bsky.feed.post/xyz");
    expect(tree.comments).toEqual([]);
  });

  it("rejects unparseable thread identifiers", async () => {
    await expect(fetchCommentTree("not a uri")).rejects.toThrowError(
      /Not a valid AT URI/,
    );
  });
});
