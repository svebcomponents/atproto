import { env } from "$env/dynamic/private";
import {
  createAtprotoCommentsService,
  type AtprotoCommentsService,
} from "@svebcomponents/atproto.bridge";

import { createSqliteStores } from "./sqliteStores.js";

let cached: AtprotoCommentsService | undefined;

/** parses a positive-number env var; a typo'd value should fail loudly, not become NaN */
const positiveNumberEnv = (name: string): number | undefined => {
  const raw = env[name];
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `${name} must be a positive number (got ${JSON.stringify(raw)})`,
    );
  }
  return value;
};

/**
 * The bridge service, constructed once per process. Config comes from the
 * environment:
 *   SERVICE_URL      — the service's own public origin (default 127.0.0.1 dev)
 *   SESSION_SECRET   — HS256 secret for browser session tokens
 *   OAUTH_PRIVATE_KEYS — newline-separated PKCS#8 PEM keys (https deploys only)
 *   SERVICE_DB_PATH  — sqlite file (default ./.data/service.db)
 *   SESSION_MODE     — bearer (cross-origin hosted default) or cookie
 *   SPACEDUST_URL    — optional self-hosted Spacedust websocket origin
 *   APPVIEW_URL      — optional AppView for profile lookups and handle
 *                      resolution (default: the public Bluesky AppView)
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
  const maxThreads = positiveNumberEnv("COMMENT_STREAM_MAX_THREADS");
  const maxSubscribers = positiveNumberEnv("COMMENT_STREAM_MAX_SUBSCRIBERS");
  const maxSubscribersPerThread = positiveNumberEnv(
    "COMMENT_STREAM_MAX_SUBSCRIBERS_PER_THREAD",
  );
  const heartbeatMs = positiveNumberEnv("COMMENT_STREAM_HEARTBEAT_MS");

  cached = createAtprotoCommentsService({
    publicUrl: serviceUrl,
    // The sign-in page asks strangers for posting authority, so it links to
    // what this service stores. Served by apps/host at /privacy.
    // The product is svebcomponents/atproto; "atproto-comments" is only the
    // custom element's tag name. This is also what the reader's own provider
    // shows them on its consent screen, so it needs to be the real name.
    clientName: "svebcomponents/atproto",
    oauthPage: {
      title: "Sign in to the ATmosphere to interact",
      brand: {
        name: "svebcomponents/atproto",
        logoUrl: "/svebcomponents.svg",
        homeUrl: "https://atproto.svebcomponents.dev",
      },
      theme: { accent: "#2563eb" },
      links: { privacy: "/privacy" },
    },
    productUrl: "https://atproto.svebcomponents.dev",
    sessionSecret,
    sessionMode: env["SESSION_MODE"] === "cookie" ? "cookie" : "bearer",
    ...(env["APPVIEW_URL"] ? { appView: env["APPVIEW_URL"] } : {}),
    commentStream: {
      ...(env["SPACEDUST_URL"] ? { spacedustUrl: env["SPACEDUST_URL"] } : {}),
      ...(maxThreads !== undefined ? { maxThreads } : {}),
      ...(maxSubscribers !== undefined ? { maxSubscribers } : {}),
      ...(maxSubscribersPerThread !== undefined
        ? { maxSubscribersPerThread }
        : {}),
      ...(heartbeatMs !== undefined ? { heartbeatMs } : {}),
    },
    ...(keys ? { keys: keys.split("\n").filter(Boolean) } : {}),
    ...stores,
  });
  return cached;
};
