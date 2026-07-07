import { describe, expect, it, vi } from "vitest";

import type { ServiceSession, ServiceSessionStore } from "./config.js";
import { createSessionTokenIssuer } from "./sessionToken.js";

const secret = "test-secret-that-is-at-least-32-chars-long";

const makeStore = (
  session: ServiceSession | undefined,
): ServiceSessionStore => ({
  get: vi.fn().mockResolvedValue(session),
  set: vi.fn(),
  del: vi.fn(),
});

const liveSession: ServiceSession = {
  did: "did:plc:abc",
  origin: "https://blog.example",
  createdAt: "2026-07-07T00:00:00.000Z",
};

const issuer = (store: ServiceSessionStore) =>
  createSessionTokenIssuer({
    secret,
    audience: "https://comments.example",
    ttlSeconds: 3600,
    serviceSessionStore: store,
  });

describe("session token", () => {
  const claims = {
    did: "did:plc:abc",
    origin: "https://blog.example",
    sid: "sid-1",
  };

  it("round-trips valid claims", async () => {
    const t = issuer(makeStore(liveSession));
    const token = await t.mint(claims);
    expect(await t.verify(token, "https://blog.example")).toEqual(claims);
  });

  it("accepts requests with no Origin header (same-origin/non-browser)", async () => {
    const t = issuer(makeStore(liveSession));
    const token = await t.mint(claims);
    expect(await t.verify(token, null)).toEqual(claims);
  });

  it("rejects a token replayed from a different origin", async () => {
    const t = issuer(makeStore(liveSession));
    const token = await t.mint(claims);
    expect(await t.verify(token, "https://evil.example")).toBeNull();
  });

  it("rejects a token whose session was revoked", async () => {
    const t = issuer(makeStore(undefined));
    const token = await t.mint(claims);
    expect(await t.verify(token, "https://blog.example")).toBeNull();
  });

  it("rejects a token whose stored session origin no longer matches", async () => {
    const t = issuer(
      makeStore({ ...liveSession, origin: "https://moved.example" }),
    );
    const token = await t.mint(claims);
    expect(await t.verify(token, "https://blog.example")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const minted = await createSessionTokenIssuer({
      secret: "another-secret-that-is-also-32-chars-x",
      audience: "https://comments.example",
      ttlSeconds: 3600,
      serviceSessionStore: makeStore(liveSession),
    }).mint(claims);
    expect(
      await issuer(makeStore(liveSession)).verify(minted, null),
    ).toBeNull();
  });

  it("rejects a token with the wrong audience", async () => {
    const minted = await createSessionTokenIssuer({
      secret,
      audience: "https://other.example",
      ttlSeconds: 3600,
      serviceSessionStore: makeStore(liveSession),
    }).mint(claims);
    expect(
      await issuer(makeStore(liveSession)).verify(minted, null),
    ).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    try {
      const t = issuer(makeStore(liveSession));
      const token = await t.mint(claims);
      vi.setSystemTime(Date.now() + 3601_000);
      expect(await t.verify(token, null)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects garbage", async () => {
    expect(
      await issuer(makeStore(liveSession)).verify("not.a.jwt", null),
    ).toBeNull();
  });
});
