import { env } from "$env/dynamic/private";
import {
  createAtprotoCommentsService,
  type AtprotoCommentsService,
} from "@atproto-comments/service-core";

import { createSqliteStores } from "./sqliteStores.js";

let cached: AtprotoCommentsService | undefined;

/**
 * The bridge service, constructed once per process. Config comes from the
 * environment:
 *   PUBLIC_URL       — the service's own public origin (default localhost dev)
 *   SESSION_SECRET   — HS256 secret for browser session tokens
 *   OAUTH_PRIVATE_KEYS — newline-separated PKCS#8 PEM keys (https deploys only)
 *   SERVICE_DB_PATH  — sqlite file (default ./.data/service.db)
 */
export const getService = (): AtprotoCommentsService => {
  if (cached) return cached;

  const publicUrl = env["PUBLIC_URL"] ?? "http://localhost:45871";
  const sessionSecret =
    env["SESSION_SECRET"] ??
    // deterministic dev-only fallback so localhost works with zero setup
    (publicUrl.startsWith("http://localhost")
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
    publicUrl,
    sessionSecret,
    ...(keys ? { keys: keys.split("\n").filter(Boolean) } : {}),
    ...stores,
  });
  return cached;
};
