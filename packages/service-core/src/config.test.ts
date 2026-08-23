import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryAuthClaimStore } from "./config.js";
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
