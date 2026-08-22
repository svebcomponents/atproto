import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AuthClaim,
  AuthClaimStore,
  MetricCounts,
  MetricsStore,
  MetricsTotals,
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
  metricsStore: MetricsStore;
}

/** pending auth claims live at most this long */
const CLAIM_TTL_MS = 120_000;

/**
 * How long an unused ATProto token set is kept. These are the credentials
 * that let the bridge post as a reader, so they are the most sensitive rows
 * in the database — a copy of this file is posting access to every account
 * in it. Signing out revokes and deletes the row immediately; this TTL is
 * the backstop for everyone who simply closes the tab and never returns.
 * Each refresh rewrites the row and pushes the expiry out, so an actively
 * used session is never cut off.
 */
const OAUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

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
    CREATE TABLE IF NOT EXISTS metrics_daily (
      origin TEXT NOT NULL,
      day TEXT NOT NULL,
      sign_in INTEGER NOT NULL DEFAULT 0,
      reply INTEGER NOT NULL DEFAULT 0,
      reaction INTEGER NOT NULL DEFAULT 0,
      stream_connect INTEGER NOT NULL DEFAULT 0,
      rate_limited INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (origin, day)
    );
  `);
  // Pre-existing databases created before expires_at existed on oauth_state.
  try {
    db.exec(
      "ALTER TABLE oauth_state ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0",
    );
  } catch {
    // column already present
  }
  // Pre-existing databases created before oauth_session had a TTL. Existing
  // rows get 0, which `expiring` treats as "no expiry recorded" and renews on
  // next write, so nobody is signed out by the upgrade itself.
  try {
    db.exec(
      "ALTER TABLE oauth_session ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0",
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

  /**
   * Like {@link kv}, but rows age out. `expires_at = 0` marks a row written
   * before the column existed: it stays readable and picks up a real expiry
   * the next time it is written.
   */
  const expiringKv = <T>(table: string, keyColumn: string, ttlMs: number) => {
    const setStmt = db.prepare(
      `INSERT INTO ${table} (${keyColumn}, value, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(${keyColumn}) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
    );
    const getStmt = db.prepare(
      `SELECT value, expires_at FROM ${table} WHERE ${keyColumn} = ?`,
    );
    const delStmt = db.prepare(`DELETE FROM ${table} WHERE ${keyColumn} = ?`);
    const sweepStmt = db.prepare(
      `DELETE FROM ${table} WHERE expires_at != 0 AND expires_at <= ?`,
    );
    return {
      async set(key: string, value: T): Promise<void> {
        sweepStmt.run(Date.now());
        setStmt.run(key, JSON.stringify(value), Date.now() + ttlMs);
      },
      async get(key: string): Promise<T | undefined> {
        const row = getStmt.get(key) as
          { value: string; expires_at: number } | undefined;
        if (!row) return undefined;
        if (row.expires_at !== 0 && row.expires_at <= Date.now()) {
          delStmt.run(key);
          return undefined;
        }
        return JSON.parse(row.value) as T;
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

  /**
   * Operational counters, one row per embedding site per UTC day. These are
   * counts about websites, not people: no IP address, user agent, thread, or
   * per-reader row goes in here, which is why the table has no retention
   * sweep — there is nothing in it that ages into a liability.
   *
   * `add` increments rather than replaces: the recorder flushes deltas and
   * writes the same bucket repeatedly through the day.
   */
  const metricsAddStmt = db.prepare(
    `INSERT INTO metrics_daily (origin, day, sign_in, reply, reaction, stream_connect, rate_limited)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(origin, day) DO UPDATE SET
       sign_in = sign_in + excluded.sign_in,
       reply = reply + excluded.reply,
       reaction = reaction + excluded.reaction,
       stream_connect = stream_connect + excluded.stream_connect,
       rate_limited = rate_limited + excluded.rate_limited`,
  );
  const metricsTotalsStmt = db.prepare(
    `SELECT COUNT(DISTINCT origin) AS sites,
            COALESCE(SUM(sign_in), 0) AS sign_ins,
            COALESCE(SUM(reply), 0) AS replies,
            COALESCE(SUM(reaction), 0) AS reactions,
            COALESCE(SUM(stream_connect), 0) AS stream_connects,
            COALESCE(SUM(rate_limited), 0) AS rate_limited,
            MIN(day) AS since
     FROM metrics_daily`,
  );
  const metricsStore: MetricsStore = {
    async add(origin, day, counts: MetricCounts) {
      metricsAddStmt.run(
        origin,
        day,
        counts.signIn ?? 0,
        counts.reply ?? 0,
        counts.reaction ?? 0,
        counts.streamConnect ?? 0,
        counts.rateLimited ?? 0,
      );
    },
    async totals(): Promise<MetricsTotals> {
      const row = metricsTotalsStmt.get() as {
        sites: number;
        sign_ins: number;
        replies: number;
        reactions: number;
        stream_connects: number;
        rate_limited: number;
        since: string | null;
      };
      return {
        sites: row.sites,
        signIns: row.sign_ins,
        replies: row.replies,
        reactions: row.reactions,
        streamConnects: row.stream_connects,
        rateLimited: row.rate_limited,
        ...(row.since ? { since: row.since } : {}),
      };
    },
  };

  return {
    stateStore,
    // oauth-client-node keys sessions by `sub` (the DID)
    sessionStore: expiringKv<NodeSavedSession>(
      "oauth_session",
      "did",
      OAUTH_SESSION_TTL_MS,
    ),
    serviceSessionStore: kv<ServiceSession>("service_session", "sid"),
    authClaimStore,
    metricsStore,
  };
};
