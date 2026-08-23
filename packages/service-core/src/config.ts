import type {
  NodeSavedSessionStore,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import {
  createMemoryMetricsStore,
  createMetricsRecorder,
  type MetricsRecorder,
  type MetricsStore,
} from "./metrics.js";
import {
  resolveCommentStreamConfig,
  type CommentStreamConfig,
  type ResolvedCommentStreamConfig,
} from "./commentStream.js";

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
 *
 * Implementations should age out entries that are not re-`set` within some
 * retention window (the reference SQLite store uses 30 days): sign-out
 * revocation alone would otherwise leave a row behind forever for everyone
 * who never returns. The bridge calls `set` again on activity — session
 * reads and token refreshes — so an engaged reader keeps their session while
 * abandoned ones eventually disappear.
 */
export interface ServiceSessionStore {
  set(sid: string, session: ServiceSession): Promise<void>;
  get(sid: string): Promise<ServiceSession | undefined>;
  del(sid: string): Promise<void>;
}

/** returns true when the action is allowed, false when rate-limited */
export type RateLimiter = (key: string) => Promise<boolean> | boolean;
export type SessionMode = "bearer" | "cookie";

export interface OAuthPageBrandConfig {
  /** Name shown in the bridge's sign-in page header (defaults to clientName). */
  name?: string;
  /** Logo URL, absolute or resolved against publicUrl. */
  logoUrl?: string;
  /** Destination for the brand link, absolute or resolved against publicUrl. */
  homeUrl?: string;
}

export interface OAuthPageThemeConfig {
  /** CSS color used for buttons, links, and focus rings. */
  accent?: string;
}

export interface OAuthPageLinksConfig {
  /** Privacy-policy URL, absolute or resolved against publicUrl. */
  privacy?: string;
  /** Support URL, absolute or resolved against publicUrl. */
  support?: string;
}

/** Presentation-only customization for the bridge-owned OAuth sign-in page. */
export interface OAuthPageConfig {
  /** Main sign-in heading. Also used as the document title when configured. */
  title?: string;
  brand?: OAuthPageBrandConfig;
  theme?: OAuthPageThemeConfig;
  links?: OAuthPageLinksConfig;
}

/**
 * A freshly-minted session waiting to be claimed by the tab that started
 * sign-in. Keyed by an unguessable nonce (the claim's bearer secret) because
 * OAuth providers set `Cross-Origin-Opener-Policy`, which severs
 * `window.opener` during the cross-origin redirect — so the popup can't
 * reliably `postMessage` back. The opener polls for the claim instead.
 */
export interface AuthClaim {
  /**
   * Web origin this claim may be released to. The nonce alone is NOT a
   * sufficient secret: it arrives as a `?claim=` query parameter on a public
   * endpoint, so an attacker can craft a sign-in link carrying a nonce they
   * chose, point `origin` at a site the victim trusts, and then poll for the
   * finished session. Requiring the retrieving page's `Origin` to match the
   * origin the flow was authorized for means a claim can only be collected
   * by the site it was minted for.
   */
  origin: string;
  /** Present for cross-origin bearer sessions; omitted for cookie sessions. */
  token?: string;
  did: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}

/** short-TTL, single-read store for pending auth claims */
export interface AuthClaimStore {
  set(nonce: string, claim: AuthClaim): Promise<void>;
  /** returns and removes the claim (one-time), or undefined if absent/expired */
  take(nonce: string): Promise<AuthClaim | undefined>;
}

export interface ServiceConfig {
  /**
   * Public base URL the service is reachable at, e.g.
   * `https://atproto.example.com`. `http://localhost[:port]` /
   * `http://127.0.0.1[:port]` switches to atproto's loopback client mode for
   * local development (no keys required).
   */
  publicUrl: string;
  /** path prefix the handlers are mounted under (default: "/atproto") */
  basePath?: string;
  /** shown on the sign-in page and in client metadata */
  clientName?: string;
  /** Branding, theme, and operator links for the OAuth sign-in page. */
  oauthPage?: OAuthPageConfig;
  /**
   * Link to the operator's privacy policy, shown on the sign-in page. An
   * absolute URL, or a path resolved against `publicUrl` (e.g. "/privacy").
   * Omit and the link is not rendered — but a public deployment asking
   * strangers for posting authority should say what it stores.
   */
  privacyUrl?: string;
  /**
   * The project's own site. When set, the bridge's pages show its brand
   * header and a short footer pitch beneath the sign-in card. Leave unset for
   * a self-hosted deployment that should not advertise someone else's
   * project on its sign-in screen.
   */
  productUrl?: string;
  /** HS256 secret for the service's own bearer tokens (>= 32 chars) */
  sessionSecret: string;
  /** bearer token lifetime in seconds (default: 3600) */
  sessionTtlSeconds?: number;
  /**
   * Browser session transport. Bearer tokens work cross-origin; cookie mode
   * is intended for a same-origin self-hosted backend.
   */
  sessionMode?: SessionMode;
  /** HttpOnly cookie name used by cookie session mode. */
  sessionCookieName?: string;
  /**
   * Web origins allowed to start a sign-in and hold a session, e.g.
   * `["https://blog.example"]`. Omit (the default) to accept any origin —
   * what the public hosted instance needs, since it serves sites it has
   * never seen. A self-hosted bridge almost always wants exactly one origin
   * here: with no allowlist, any site on the internet can run its own
   * comment section against your deployment and your OAuth client identity.
   */
  allowedOrigins?: readonly string[];
  /**
   * OAuth scopes requested from the user's PDS. Default grants create on
   * replies plus create+delete on likes/reposts (the latter pair needed to
   * toggle them back off): `atproto repo:app.bsky.feed.post?action=create
   * repo:app.bsky.feed.like?action=create&action=delete
   * repo:app.bsky.feed.repost?action=create&action=delete`.
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
  /**
   * Pending-auth claim store (default: in-memory, 120s TTL). In-memory is
   * fine even for the reference deployment — claims live for seconds — but a
   * multi-instance deployment behind a load balancer needs a shared store.
   */
  authClaimStore?: AuthClaimStore;
  /** rate limiter for reply posting, keyed per DID (default: 10 per 10min) */
  replyRateLimiter?: RateLimiter;
  /** rate limiter for like/repost toggling, keyed per DID (default: 60 per 10min) */
  reactionRateLimiter?: RateLimiter;
  /** AppView for unauthenticated profile lookups */
  appView?: string;
  /**
   * Live-comment stream limits and Spacedust upstream. The broker opens no
   * connection until a client requests `/api/comments/stream`.
   */
  commentStream?: CommentStreamConfig;
  /**
   * Storage for operational counters (sites using the service, sign-ins,
   * replies, stream connections), aggregated per embedding origin per UTC
   * day. Defaults to in-memory, which resets with the process. Counts only —
   * see `metrics.ts` for what is deliberately not measured.
   */
  metricsStore?: MetricsStore;
  /** how long counters may sit buffered before being written (default 60s) */
  metricsFlushIntervalMs?: number;
  /** injectable for tests */
  fetch?: typeof globalThis.fetch;
}

export interface ResolvedServiceConfig extends ServiceConfig {
  basePath: string;
  clientName: string;
  sessionTtlSeconds: number;
  sessionMode: SessionMode;
  sessionCookieName: string;
  scope: string;
  appView: string;
  commentStream: ResolvedCommentStreamConfig;
  authClaimStore: AuthClaimStore;
  replyRateLimiter: RateLimiter;
  reactionRateLimiter: RateLimiter;
  fetch: typeof globalThis.fetch;
  /** buffering counter recorder, built from `metricsStore` */
  metrics: MetricsRecorder;
  /** normalized to bare origins; undefined means "any origin" */
  allowedOrigins?: readonly string[];
  /** absolute privacy policy URL, resolved against publicUrl */
  privacyUrl?: string;
  /** the project's own site, enabling brand header and footer pitch */
  productUrl?: string;
  /** OAuth page config with every configured URL made absolute. */
  oauthPage?: OAuthPageConfig;
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
  const sessionCookieName =
    config.sessionCookieName ?? "atproto_comments_session";
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(sessionCookieName)) {
    throw new Error("sessionCookieName contains invalid characters");
  }
  // Normalize the allowlist up front so a typo fails at construction rather
  // than silently refusing every sign-in at runtime.
  const allowedOrigins = config.allowedOrigins?.map((value) => {
    let origin: string;
    try {
      origin = new URL(value).origin;
    } catch {
      throw new Error(`allowedOrigins contains an invalid URL: ${value}`);
    }
    if (origin === "null") {
      throw new Error(`allowedOrigins entry has no origin: ${value}`);
    }
    return origin;
  });
  const oauthPage = config.oauthPage
    ? {
        ...(config.oauthPage.title
          ? { title: config.oauthPage.title.trim() }
          : {}),
        ...(config.oauthPage.brand
          ? {
              brand: {
                ...(config.oauthPage.brand.name
                  ? { name: config.oauthPage.brand.name.trim() }
                  : {}),
                ...(config.oauthPage.brand.logoUrl
                  ? {
                      logoUrl: new URL(
                        config.oauthPage.brand.logoUrl,
                        url.origin,
                      ).toString(),
                    }
                  : {}),
                ...(config.oauthPage.brand.homeUrl
                  ? {
                      homeUrl: new URL(
                        config.oauthPage.brand.homeUrl,
                        url.origin,
                      ).toString(),
                    }
                  : {}),
              },
            }
          : {}),
        ...(config.oauthPage.theme?.accent
          ? {
              theme: {
                accent: resolveAccent(config.oauthPage.theme.accent),
              },
            }
          : {}),
        ...(config.oauthPage.links
          ? {
              links: {
                ...(config.oauthPage.links.privacy
                  ? {
                      privacy: new URL(
                        config.oauthPage.links.privacy,
                        url.origin,
                      ).toString(),
                    }
                  : {}),
                ...(config.oauthPage.links.support
                  ? {
                      support: new URL(
                        config.oauthPage.links.support,
                        url.origin,
                      ).toString(),
                    }
                  : {}),
              },
            }
          : {}),
      }
    : undefined;

  // Key presence is enforced in buildOAuthClient (where they're actually
  // used), not here — so an injected OAuth client can skip them entirely.
  return {
    ...config,
    ...(allowedOrigins ? { allowedOrigins } : {}),
    publicUrl: url.origin,
    basePath: config.basePath ?? "/atproto",
    ...(config.privacyUrl
      ? { privacyUrl: new URL(config.privacyUrl, url.origin).toString() }
      : {}),
    ...(config.productUrl
      ? { productUrl: new URL(config.productUrl, url.origin).toString() }
      : {}),
    ...(oauthPage ? { oauthPage } : {}),
    clientName: config.clientName ?? "atproto-comments",
    sessionTtlSeconds: config.sessionTtlSeconds ?? 3600,
    sessionMode: config.sessionMode ?? "bearer",
    sessionCookieName,
    scope:
      config.scope ??
      "atproto repo:app.bsky.feed.post?action=create repo:app.bsky.feed.like?action=create&action=delete repo:app.bsky.feed.repost?action=create&action=delete",
    appView: config.appView ?? "https://public.api.bsky.app",
    commentStream: resolveCommentStreamConfig(config.commentStream),
    authClaimStore:
      config.authClaimStore ?? createMemoryAuthClaimStore(120_000),
    replyRateLimiter:
      config.replyRateLimiter ?? createMemoryRateLimiter(10, 10 * 60_000),
    reactionRateLimiter:
      config.reactionRateLimiter ?? createMemoryRateLimiter(60, 10 * 60_000),
    fetch: config.fetch ?? globalThis.fetch,
    metrics: createMetricsRecorder({
      store: config.metricsStore ?? createMemoryMetricsStore(),
      ...(config.metricsFlushIntervalMs !== undefined
        ? { flushIntervalMs: config.metricsFlushIntervalMs }
        : {}),
    }),
    isLoopback,
  };
};

const resolveAccent = (value: string): string => {
  const accent = value.trim();
  if (!accent || /[;{}]/.test(accent)) {
    throw new Error("oauthPage.theme.accent must be a CSS color");
  }
  return accent;
};

/** in-memory single-read claim store with TTL expiry */
export const createMemoryAuthClaimStore = (ttlMs: number): AuthClaimStore => {
  const claims = new Map<string, { claim: AuthClaim; expiresAt: number }>();
  return {
    async set(nonce, claim) {
      // Evict expired entries so claims that are never taken don't
      // accumulate (mirrors the sweep-on-write the SQLite store does).
      const now = Date.now();
      for (const [key, entry] of claims) {
        if (entry.expiresAt <= now) claims.delete(key);
      }
      claims.set(nonce, { claim, expiresAt: now + ttlMs });
    },
    async take(nonce) {
      const entry = claims.get(nonce);
      if (!entry) return undefined;
      claims.delete(nonce);
      return entry.expiresAt > Date.now() ? entry.claim : undefined;
    },
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
