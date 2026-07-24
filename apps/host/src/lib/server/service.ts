import { env } from "$env/dynamic/private";
import {
  createAtprotoCommentsService,
  type AtprotoCommentsService,
} from "@svebcomponents/atproto.bridge";

import { createSqliteStores } from "./sqliteStores.js";

let cached: AtprotoCommentsService | undefined;

/**
 * The bridge service, constructed once per process. Config comes from the
 * environment:
 *   SERVICE_URL      — the service's own public origin (default 127.0.0.1 dev)
 *   SESSION_SECRET   — HS256 secret for browser session tokens
 *   OAUTH_PRIVATE_KEYS — newline-separated PKCS#8 PEM keys (https deploys only)
 *   SERVICE_DB_PATH  — sqlite file (default ./.data/service.db)
 *   SESSION_MODE     — bearer (cross-origin hosted default) or cookie
 *   SPACEDUST_URL    — optional self-hosted Spacedust websocket origin
 *
 * Note: the origin var is deliberately NOT named with a `PUBLIC_` prefix —
 * SvelteKit reserves that prefix for client-exposed vars, so `$env/dynamic/
 * private` would return undefined for it.
 */
export const getService = (): AtprotoCommentsService => {
  if (cached) return cached;

  // 127.0.0.1 (not localhost) is required by atproto's loopback client rules
  const serviceUrl = env["SERVICE_URL"] ?? "http://127.0.0.1:5173";
  const isLocalDev =
    serviceUrl.startsWith("http://127.0.0.1") ||
    serviceUrl.startsWith("http://localhost");
  const sessionSecret =
    env["SESSION_SECRET"] ??
    // deterministic dev-only fallback so local dev works with zero setup
    (isLocalDev
      ? "dev-only-insecure-session-secret-change-me"
      : (() => {
          throw new Error(
            "SESSION_SECRET is required for non-localhost deployments",
          );
        })());

  const stores = createSqliteStores(
    env["SERVICE_DB_PATH"] ?? "./.data/service.db",
  );
  const keys = env["OAUTH_PRIVATE_KEYS"];

  cached = createAtprotoCommentsService({
    publicUrl: serviceUrl,
    sessionSecret,
    sessionMode: env["SESSION_MODE"] === "cookie" ? "cookie" : "bearer",
    commentStream: {
      ...(env["SPACEDUST_URL"] ? { spacedustUrl: env["SPACEDUST_URL"] } : {}),
      ...(env["COMMENT_STREAM_MAX_THREADS"]
        ? { maxThreads: Number(env["COMMENT_STREAM_MAX_THREADS"]) }
        : {}),
      ...(env["COMMENT_STREAM_MAX_SUBSCRIBERS"]
        ? {
            maxSubscribers: Number(env["COMMENT_STREAM_MAX_SUBSCRIBERS"]),
          }
        : {}),
      ...(env["COMMENT_STREAM_MAX_SUBSCRIBERS_PER_THREAD"]
        ? {
            maxSubscribersPerThread: Number(
              env["COMMENT_STREAM_MAX_SUBSCRIBERS_PER_THREAD"],
            ),
          }
        : {}),
      ...(env["COMMENT_STREAM_HEARTBEAT_MS"]
        ? { heartbeatMs: Number(env["COMMENT_STREAM_HEARTBEAT_MS"]) }
        : {}),
    },
    ...(keys ? { keys: keys.split("\n").filter(Boolean) } : {}),
    ...stores,
  });
  return cached;
};
