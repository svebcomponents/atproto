import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryAuthClaimStore,
  DEFAULT_CONSTELLATION,
  resolveConfig,
} from "./config.js";
import type { AuthClaim } from "./config.js";

const claim: AuthClaim = {
  origin: "https://blog.example",
  token: "tok",
  did: "did:plc:me",
  handle: "me.test",
};

describe("createMemoryAuthClaimStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns and removes a claim exactly once", async () => {
    const store = createMemoryAuthClaimStore(60_000);
    await store.set("nonce-1", claim);
    expect(await store.take("nonce-1")).toEqual(claim);
    expect(await store.take("nonce-1")).toBeUndefined();
  });

  it("treats an expired claim as absent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const store = createMemoryAuthClaimStore(1_000);
    await store.set("nonce-2", claim);
    vi.setSystemTime(1_000_000 + 1_001); // past the TTL
    expect(await store.take("nonce-2")).toBeUndefined();
  });

  it("evicts expired claims instead of accumulating them", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const store = createMemoryAuthClaimStore(1_000);
    for (let i = 0; i < 50; i += 1) await store.set(`n-${i}`, claim);
    // every entry above has now expired; writing a new one must sweep them
    vi.setSystemTime(2_000_000 + 5_000);
    const fresh = { ...claim, did: "did:plc:fresh" };
    await store.set("fresh", fresh);
    expect(await store.take("n-1")).toBeUndefined();
    expect(await store.take("fresh")).toEqual(fresh);
  });
});

describe("resolveConfig", () => {
  const base = {
    publicUrl: "https://comments.example",
    sessionSecret: "test-secret-that-is-at-least-32-chars-long",
    stateStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
    sessionStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
    serviceSessionStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
  };

  it("defaults to the public backlink index", () => {
    expect(resolveConfig(base).constellation).toBe(DEFAULT_CONSTELLATION);
  });

  it("asks the reader only for the write scopes it needs", () => {
    // viewer state comes from public data, so it must not widen the grant
    expect(resolveConfig(base).scope.split(" ").sort()).toEqual([
      "atproto",
      "repo:app.bsky.feed.like?action=create&action=delete",
      "repo:app.bsky.feed.post?action=create",
      "repo:app.bsky.feed.repost?action=create&action=delete",
    ]);
  });

  it("normalizes a custom index to its origin", () => {
    const { constellation } = resolveConfig({
      ...base,
      constellation: "https://links.example/some/path",
    });
    expect(constellation).toBe("https://links.example");
  });

  it("rejects an index URL that is not http(s)", () => {
    expect(() =>
      resolveConfig({ ...base, constellation: "wss://links.example" }),
    ).toThrow(/http/);
  });
});

describe("permission sets", () => {
  const EXTENSION = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
  const feeds = {
    clientName: "Reader App",
    description: "Read your timeline",
    origins: [`${EXTENSION}/`],
    methods: [
      {
        nsid: "app.bsky.feed.getTimeline",
        aud: "did:web:api.bsky.app#bsky_appview",
      },
    ],
  };
  const base = () => ({
    publicUrl: "https://comments.example",
    sessionSecret: "test-secret-that-is-at-least-32-chars-long",
    stateStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
    sessionStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
    serviceSessionStore: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
  });

  it("offers none by default", () => {
    expect(resolveConfig(base()).permissionSets).toEqual({});
  });

  it("adds the set's rpc scopes to the default scope", () => {
    const config = resolveConfig({ ...base(), permissionSets: { feeds } });
    expect(config.permissionSets["feeds"]!.scope).toBe(
      `${config.scope} rpc:app.bsky.feed.getTimeline?aud=did:web:api.bsky.app%23bsky_appview`,
    );
    // the default client's scope is unchanged
    expect(config.scope).toBe(resolveConfig(base()).scope);
  });

  it("normalizes the set's origins", () => {
    const config = resolveConfig({ ...base(), permissionSets: { feeds } });
    expect(config.permissionSets["feeds"]!.origins).toEqual([EXTENSION]);
  });

  it("namespaces the set's stores, leaving the default keys alone", async () => {
    const config = base();
    const { permissionSets } = resolveConfig({
      ...config,
      permissionSets: { feeds },
    });
    await permissionSets["feeds"]!.sessionStore.set("did:plc:me", {} as never);
    await permissionSets["feeds"]!.stateStore.get("state-key");
    expect(config.sessionStore.set).toHaveBeenCalledWith(
      "sets/feeds/did:plc:me",
      {},
    );
    expect(config.stateStore.get).toHaveBeenCalledWith("sets/feeds/state-key");
  });

  it.each([
    ["an invalid name", { "Feeds!": feeds }, /lowercase/],
    ["no origins", { feeds: { ...feeds, origins: [] } }, /at least one/],
    ["no methods", { feeds: { ...feeds, methods: [] } }, /methods/],
    [
      "an invalid NSID",
      { feeds: { ...feeds, methods: [{ ...feeds.methods[0]!, nsid: "x" }] } },
      /NSID/,
    ],
    [
      "an aud without a service fragment",
      {
        feeds: {
          ...feeds,
          methods: [{ ...feeds.methods[0]!, aud: "did:web:api.bsky.app" }],
        },
      },
      /service fragment/,
    ],
  ])("rejects %s", (_label, permissionSets, error) => {
    expect(() => resolveConfig({ ...base(), permissionSets })).toThrow(error);
  });

  it("rejects a set origin the deployment's allowlist would refuse", () => {
    expect(() =>
      resolveConfig({
        ...base(),
        allowedOrigins: ["https://blog.example"],
        permissionSets: { feeds },
      }),
    ).toThrow(/not in allowedOrigins/);
  });
});
