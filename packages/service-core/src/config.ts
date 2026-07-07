import type {
  NodeSavedSessionStore,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";

/** one browser sign-in on one site — the unit the bearer token refers to */
export interface ServiceSession {
  did: string;
  /** web origin the token is bound to (the embedding site) */
  origin: string;
  createdAt: string;
  /** profile snapshot taken at sign-in for the signed-in chrome */
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Persists {@link ServiceSession}s keyed by session id. Deleting a session
 * revokes its bearer tokens (verification checks liveness).
 */
export interface ServiceSessionStore {
  set(sid: string, session: ServiceSession): Promise<void>;
  get(sid: string): Promise<ServiceSession | undefined>;
  del(sid: string): Promise<void>;
}

/** returns true when the action is allowed, false when rate-limited */
export type RateLimiter = (key: string) => Promise<boolean> | boolean;

export interface ServiceConfig {
  /**
   * Public base URL the service is reachable at, e.g.
   * `https://comments.example.com`. `http://localhost[:port]` /
   * `http://127.0.0.1[:port]` switches to atproto's loopback client mode for
   * local development (no keys required).
   */
  publicUrl: string;
  /** path prefix the handlers are mounted under (default: "/atproto") */
  basePath?: string;
  /** shown on the sign-in page and in client metadata */
  clientName?: string;
  /** HS256 secret for the service's own bearer tokens (>= 32 chars) */
  sessionSecret: string;
  /** bearer token lifetime in seconds (default: 3600) */
  sessionTtlSeconds?: number;
  /**
   * OAuth scopes requested from the user's PDS. Default is the narrowest
   * posting grant: `atproto repo:app.bsky.feed.post?action=create`.
   */
  scope?: string;
  /**
   * Private keys (PKCS#8 PEM or JWK JSON strings) for `private_key_jwt`
   * client authentication. Required for https deployments; ignored in
   * loopback mode.
   */
  keys?: string[];
  /** short-lived OAuth flow state (PKCE, DPoP nonces) */
  stateStore: NodeSavedStateStore;
  /** ATProto token sets, keyed by DID — encrypt at rest in production */
  sessionStore: NodeSavedSessionStore;
  /** the service's own browser sessions */
  serviceSessionStore: ServiceSessionStore;
  /** rate limiter for reply posting, keyed per DID (default: 10 per 10min) */
  replyRateLimiter?: RateLimiter;
  /** AppView for unauthenticated profile lookups */
  appView?: string;
  /** injectable for tests */
  fetch?: typeof globalThis.fetch;
}

export interface ResolvedServiceConfig extends ServiceConfig {
  basePath: string;
  clientName: string;
  sessionTtlSeconds: number;
  scope: string;
  appView: string;
  replyRateLimiter: RateLimiter;
  fetch: typeof globalThis.fetch;
  /** true when publicUrl is a localhost/127.0.0.1 loopback */
  isLoopback: boolean;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const resolveConfig = (config: ServiceConfig): ResolvedServiceConfig => {
  const url = new URL(config.publicUrl);
  const isLoopback =
    url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !isLoopback) {
    throw new Error(
      "publicUrl must be https (or http://localhost for development)",
    );
  }
  if (config.sessionSecret.length < 32) {
    throw new Error("sessionSecret must be at least 32 characters");
  }
  // Key presence is enforced in buildOAuthClient (where they're actually
  // used), not here — so an injected OAuth client can skip them entirely.
  return {
    ...config,
    publicUrl: url.origin,
    basePath: config.basePath ?? "/atproto",
    clientName: config.clientName ?? "atproto-comments",
    sessionTtlSeconds: config.sessionTtlSeconds ?? 3600,
    scope: config.scope ?? "atproto repo:app.bsky.feed.post?action=create",
    appView: config.appView ?? "https://public.api.bsky.app",
    replyRateLimiter:
      config.replyRateLimiter ?? createMemoryRateLimiter(10, 10 * 60_000),
    fetch: config.fetch ?? globalThis.fetch,
    isLoopback,
  };
};

/** simple sliding-window in-memory limiter — fine for a single instance */
export const createMemoryRateLimiter = (
  limit: number,
  windowMs: number,
): RateLimiter => {
  const hits = new Map<string, number[]>();
  return (key) => {
    const now = Date.now();
    const windowStart = now - windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
};
