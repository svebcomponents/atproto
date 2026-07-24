import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NodeSavedState } from "@svebcomponents/atproto.bridge";

import { createSqliteStores } from "./sqliteStores.js";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atproto-stores-"));
  dbPath = join(dir, "service.db");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const claim = {
  token: "tok",
  did: "did:plc:me",
  handle: "me.test",
};

describe("sqlite auth claim store", () => {
  it("stores and takes a claim once", async () => {
    const { authClaimStore } = createSqliteStores(dbPath);
    await authClaimStore.set("nonce-1", claim);
    expect(await authClaimStore.take("nonce-1")).toEqual(claim);
    // single-read: gone after the first take
    expect(await authClaimStore.take("nonce-1")).toBeUndefined();
  });

  it("survives a fresh store instance on the same DB (dev singleton reset)", async () => {
    // this is the exact failure the SQLite backing fixes: the callback and the
    // poll are separate requests, and in dev the in-memory singleton is not
    // shared between them.
    const writer = createSqliteStores(dbPath);
    await writer.authClaimStore.set("nonce-2", claim);

    // a brand-new store object over the same file (simulating a new request /
    // reloaded module) must still see the claim
    const reader = createSqliteStores(dbPath);
    expect(await reader.authClaimStore.take("nonce-2")).toEqual(claim);
  });

  it("returns undefined for an unknown nonce", async () => {
    const { authClaimStore } = createSqliteStores(dbPath);
    expect(await authClaimStore.take("missing")).toBeUndefined();
  });

  it("round-trips the other stores too", async () => {
    const { serviceSessionStore } = createSqliteStores(dbPath);
    const session = {
      did: "did:plc:me",
      origin: "https://blog.example",
      createdAt: new Date().toISOString(),
    };
    await serviceSessionStore.set("sid-1", session);
    expect(await serviceSessionStore.get("sid-1")).toEqual(session);
    await serviceSessionStore.del("sid-1");
    expect(await serviceSessionStore.get("sid-1")).toBeUndefined();
  });
});

describe("sqlite oauth state store", () => {
  // Fixture shape only — never used cryptographically, just round-tripped
  // through JSON, so the JWK/authMethod fields don't need to be real.
  const state = {
    iss: "https://pds.example",
    verifier: "v",
    authMethod: "none",
    dpopJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
  } as unknown as NodeSavedState;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a pending state", async () => {
    const { stateStore } = createSqliteStores(dbPath);
    await stateStore.set("state-1", state);
    expect(await stateStore.get("state-1")).toEqual(state);
    await stateStore.del("state-1");
    expect(await stateStore.get("state-1")).toBeUndefined();
  });

  it("stops returning state once it's past the TTL", async () => {
    vi.useFakeTimers();
    const { stateStore } = createSqliteStores(dbPath);
    await stateStore.set("state-2", state);
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(await stateStore.get("state-2")).toBeUndefined();
  });

  it("sweeps expired rows from disk when a new state is set", async () => {
    vi.useFakeTimers();
    const { stateStore } = createSqliteStores(dbPath);
    await stateStore.set("abandoned", state);
    vi.advanceTimersByTime(10 * 60_000 + 1);

    // setting a new state triggers the sweep as a side effect
    await stateStore.set("fresh", state);

    const db = new DatabaseSync(dbPath);
    const rows = db.prepare("SELECT key FROM oauth_state").all() as {
      key: string;
    }[];
    db.close();
    expect(rows.map((r) => r.key)).toEqual(["fresh"]);
  });
});
