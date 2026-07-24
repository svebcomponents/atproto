import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AuthClaim,
  AuthClaimStore,
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
  ServiceSession,
  ServiceSessionStore,
} from "@svebcomponents/atproto.bridge";

/**
 * SQLite-backed store drivers for the service, using Node's built-in
 * `node:sqlite` (no native rebuild step). One tiny table per store; values
 * are JSON blobs so the schema never tracks ATProto's evolving session
 * shapes. Fine for a single instance — swap for libsql/Postgres if the
 * service is ever horizontally scaled.
 */
export interface Stores {
  stateStore: NodeSavedStateStore;
  sessionStore: NodeSavedSessionStore;
  serviceSessionStore: ServiceSessionStore;
  authClaimStore: AuthClaimStore;
}

/** pending auth claims live at most this long */
const CLAIM_TTL_MS = 120_000;

/**
 * Pending OAuth authorization state (the PKCE verifier + issuer, keyed by the
 * `state` param) lives at most this long. A user who starts the sign-in flow
 * and never completes it — closes the tab, backs out — would otherwise leave
 * this row behind forever; unlike auth_claim and service_session, nothing in
 * @atproto/oauth-client ever sweeps abandoned state on its own.
 */
const STATE_TTL_MS = 10 * 60_000;

export const createSqliteStores = (path: string): Stores => {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS oauth_session (did TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS service_session (sid TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_claim (nonce TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
  `);
  // Pre-existing databases created before expires_at existed on oauth_state.
  try {
    db.exec(
      "ALTER TABLE oauth_state ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0",
    );
  } catch {
    // column already present
  }

  const kv = <T>(table: string, keyColumn: string) => {
    const setStmt = db.prepare(
      `INSERT INTO ${table} (${keyColumn}, value) VALUES (?, ?)
       ON CONFLICT(${keyColumn}) DO UPDATE SET value = excluded.value`,
    );
    const getStmt = db.prepare(
      `SELECT value FROM ${table} WHERE ${keyColumn} = ?`,
    );
    const delStmt = db.prepare(`DELETE FROM ${table} WHERE ${keyColumn} = ?`);
    return {
      async set(key: string, value: T): Promise<void> {
        setStmt.run(key, JSON.stringify(value));
      },
      async get(key: string): Promise<T | undefined> {
        const row = getStmt.get(key) as { value: string } | undefined;
        return row ? (JSON.parse(row.value) as T) : undefined;
      },
      async del(key: string): Promise<void> {
        delStmt.run(key);
      },
    };
  };

  // The claim store must be persistent (not the in-memory default): the OAuth
  // callback and the opener's poll are separate requests, and in dev the
  // service singleton holding an in-memory Map is not reliably shared between
  // them. TTL + single-read (delete on take) semantics.
  const claimSetStmt = db.prepare(
    `INSERT INTO auth_claim (nonce, value, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(nonce) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
  );
  const claimTakeStmt = db.prepare(
    `DELETE FROM auth_claim WHERE nonce = ? RETURNING value, expires_at`,
  );
  const claimSweepStmt = db.prepare(
    `DELETE FROM auth_claim WHERE expires_at <= ?`,
  );
  const authClaimStore: AuthClaimStore = {
    async set(nonce, claim) {
      claimSweepStmt.run(Date.now());
      claimSetStmt.run(nonce, JSON.stringify(claim), Date.now() + CLAIM_TTL_MS);
    },
    async take(nonce) {
      const row = claimTakeStmt.get(nonce) as
        { value: string; expires_at: number } | undefined;
      if (!row || row.expires_at <= Date.now()) return undefined;
      return JSON.parse(row.value) as AuthClaim;
    },
  };

  const stateSetStmt = db.prepare(
    `INSERT INTO oauth_state (key, value, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
  );
  const stateGetStmt = db.prepare(
    `SELECT value, expires_at FROM oauth_state WHERE key = ?`,
  );
  const stateDelStmt = db.prepare(`DELETE FROM oauth_state WHERE key = ?`);
  const stateSweepStmt = db.prepare(
    `DELETE FROM oauth_state WHERE expires_at <= ?`,
  );
  const stateStore: NodeSavedStateStore = {
    async set(key, value) {
      stateSweepStmt.run(Date.now());
      stateSetStmt.run(key, JSON.stringify(value), Date.now() + STATE_TTL_MS);
    },
    async get(key) {
      const row = stateGetStmt.get(key) as
        { value: string; expires_at: number } | undefined;
      if (!row || row.expires_at <= Date.now()) return undefined;
      return JSON.parse(row.value) as NodeSavedState;
    },
    async del(key) {
      stateDelStmt.run(key);
    },
  };

  return {
    stateStore,
    // oauth-client-node keys sessions by `sub` (the DID)
    sessionStore: kv<NodeSavedSession>("oauth_session", "did"),
    serviceSessionStore: kv<ServiceSession>("service_session", "sid"),
    authClaimStore,
  };
};
