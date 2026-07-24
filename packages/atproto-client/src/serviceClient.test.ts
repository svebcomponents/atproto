import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceClient, ServiceError } from "./serviceClient.js";

// minimal browser-global stubs for the node test environment
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal("location", {
    href: "https://blog.example/post",
    origin: "https://blog.example",
  });
  vi.stubGlobal("localStorage", localStorageStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const TOKEN_KEY = "atproto-comments:token:https://blog.example/atproto";

describe("ServiceClient", () => {
  it("resolves a relative service URL against the page origin", () => {
    store.set(TOKEN_KEY, "tok");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ did: "d" }));
    const c = new ServiceClient(
      "/atproto",
      fetchImpl as unknown as typeof fetch,
    );
    void c.getSession();
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://blog.example/atproto/api/session",
      expect.anything(),
    );
  });

  it("never invokes the global fetch with a bad receiver (illegal invocation)", async () => {
    // reproduces the browser contract: fetch must be called with the global
    // (or undefined) as `this`, else it throws.
    const strictFetch = function (this: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(jsonResponse({ did: "did:plc:me" }));
    };
    vi.stubGlobal("fetch", strictFetch);

    store.set(TOKEN_KEY, "tok");
    // no injected fetch → must use the wrapped global safely
    const client = new ServiceClient("/atproto");
    await expect(client.getSession()).resolves.toMatchObject({
      did: "did:plc:me",
    });
  });

  it("returns null and clears the token when the session is 401", async () => {
    store.set(TOKEN_KEY, "stale");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const client = new ServiceClient(
      "/atproto",
      fetchImpl as unknown as typeof fetch,
    );
    expect(await client.getSession()).toBeNull();
    // token cleared from storage
    expect(store.has(TOKEN_KEY)).toBe(false);
  });

  it("checks for a cookie session when there is no bearer token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const client = new ServiceClient(
      "/atproto",
      fetchImpl as unknown as typeof fetch,
    );
    expect(await client.getSession()).toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://blog.example/atproto/api/session",
      expect.objectContaining({ credentials: "include", headers: {} }),
    );
  });

  it("uses an HttpOnly cookie session without exposing a token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ did: "did:plc:cookie" }));
    const client = new ServiceClient(
      "/atproto",
      fetchImpl as unknown as typeof fetch,
    );

    expect(await client.getSession()).toEqual({ did: "did:plc:cookie" });
    expect(store.has(TOKEN_KEY)).toBe(false);
  });

  it("posts a reply with the bearer token and returns the created ref", async () => {
    store.set(TOKEN_KEY, "tok");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ uri: "at://did/app.bsky.feed.post/x", cid: "bafy" }),
      );
    const client = new ServiceClient(
      "/atproto",
      fetchImpl as unknown as typeof fetch,
    );

    const ref = { uri: "at://did/app.bsky.feed.post/root", cid: "bafyroot" };
    const result = await client.postReply({
      root: ref,
      parent: ref,
      text: "hi",
    });

    expect(result).toEqual({
      uri: "at://did/app.bsky.feed.post/x",
      cid: "bafy",
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://blog.example/atproto/api/reply");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).credentials).toBe("include");
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer tok",
    });
  });

  it("throws when posting without a session", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const client = new ServiceClient(
      "/atproto",
      fetchImpl as unknown as typeof fetch,
    );
    await expect(
      client.postReply({
        root: { uri: "at://x/app.bsky.feed.post/r", cid: "c" },
        parent: { uri: "at://x/app.bsky.feed.post/r", cid: "c" },
        text: "hi",
      }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect((fetchImpl.mock.calls[0]![1] as RequestInit).headers).toEqual({
      "content-type": "application/json",
    });
  });
});
