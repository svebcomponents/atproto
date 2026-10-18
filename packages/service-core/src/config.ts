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
  /**
   * Bearer mode: the refresh generation. Each refresh mints a token for the
   * next generation and retires the previous one, so a copied token can no
   * longer be renewed once the reader's own client has renewed it. Absent
   * means 0.
   */
  generation?: number;
  /** ISO datetime of the last rotation, for its short grace window */
  rotatedAt?: string;
  /** profile snapshot taken at sign-in for the signed-in chrome */
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
  /**
   * The permission set this sign-in used (a key of
   * `ServiceConfig.permissionSets`). Absent means the default client, which
   * every comment section uses.
   */
  access?: string;
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
  /** the permission set signed in to, when not the default client */
  access?: string;
}

/** short-TTL, single-read store for pending auth claims */
export interface AuthClaimStore {
  set(nonce: string, claim: AuthClaim): Promise<void>;
  /** returns and removes the claim (one-time), or undefined if absent/expired */
  take(nonce: string): Promise<AuthClaim | undefined>;
}

/** an XRPC query a permission set grants, and the service it is proxied to */
export interface PermissionSetMethod {
  /** NSID of the query, e.g. `app.bsky.feed.getTimeline` */
  nsid: string;
  /**
   * The service the reader's PDS forwards the call to, as a DID with a
   * service fragment, e.g. `did:web:api.bsky.app#bsky_appview`.
   */
  aud: string;
}

/**
 * Extra access the operator offers to specific sites. Each set is its own
 * OAuth client, with its own `client_id`, approval screen, and stored logins,
 * so a grant made for one of these sites never reaches any other site.
 */
export interface PermissionSetConfig {
  /**
   * The app name the reader's PDS shows on its approval screen, e.g.
   * `"Cloudless (via svebcomponents/atproto)"`.
   */
  clientName: string;
  /** what the bridge's sign-in page lists, e.g. "Read your feeds" */
  description: string;
  /**
   * The only origins allowed to sign in under this set. Required: a set open
   * to any site would make the bridge a general-purpose login service.
   */
  origins: readonly string[];
  /**
   * Queries the set adds to the default scope, each as an
   * `rpc:<nsid>?aud=<aud>` scope.
   */
  methods: readonly PermissionSetMethod[];
}

export interface ResolvedPermissionSet extends PermissionSetConfig {
  name: string;
  /** normalized to bare origins */
  origins: readonly string[];
  /** the default scope plus the set's `rpc:` scopes */
  scope: string;
  /** state and session stores namespaced to this set's client */
  stateStore: NodeSavedStateStore;
  sessionStore: NodeSavedSessionStore;
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
   * How long after a bearer token expires it can still be exchanged for a
   * fresh one at `/api/session/refresh`, in seconds (default: 7 days). The
   * exchange still requires the token's origin and a live, unrevoked
   * session, and only the most recently minted token can be exchanged: a
   * refresh retires the token before it. A reader who returns within the
   * window stays signed in, and signing out ends it at once.
   */
  sessionRefreshWindowSeconds?: number;
  /**
   * Browser session transport. Bearer tokens work cross-origin; cookie mode
   * is intended for a same-origin self-hosted backend.
   */
  sessionMode?: SessionMode;
  /** HttpOnly cookie name used by cookie session mode. */
  sessionCookieName?: string;
  /**
   * Origins allowed to start a sign-in and hold a session, e.g.
   * `["https://blog.example"]`. Browser extensions sign in with their own
   * origin (`chrome-extension://<id>`, `moz-extension://<uuid>`,
   * `safari-web-extension://<uuid>`) and are listed the same way. Omit (the
   * default) to accept any website or extension —
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
  /**
   * Extra access for specific sites, keyed by a short name that sites pass
   * as `signIn({ access: name })`. Each set is a separate OAuth client; see
   * {@link PermissionSetConfig}. Default: none, so every sign-in uses the
   * default client and `scope`.
   */
  permissionSets?: Readonly<Record<string, PermissionSetConfig>>;
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
  /**
   * rate limiter for permission-set reads through `/api/xrpc`, keyed per DID
   * and set (default: 600 per 10min)
   */
  proxyRateLimiter?: RateLimiter;
  /** AppView for unauthenticated profile lookups */
  appView?: string;
  /**
   * Backlink index used to read which comments the signed-in reader has
   * already liked or reposted (default: the public Constellation instance at
   * `https://constellation.microcosm.blue`).
   *
   * Likes and reposts are public records pointing at their subject, so the
   * index can answer this from public data and `/api/viewer` needs no grant
   * from the reader. Constellation is the query half of the link index whose
   * streaming half, Spacedust, already backs live comments.
   */
  constellation?: string;
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

export interface ResolvedServiceConfig extends Omit<
  ServiceConfig,
  "permissionSets"
> {
  /** keyed by set name; empty when none are configured */
  permissionSets: Readonly<Record<string, ResolvedPermissionSet>>;
  basePath: string;
  clientName: string;
  sessionTtlSeconds: number;
  sessionRefreshWindowSeconds: number;
  sessionMode: SessionMode;
  sessionCookieName: string;
  scope: string;
  appView: string;
  /** normalized to a bare origin */
  constellation: string;
  commentStream: ResolvedCommentStreamConfig;
  authClaimStore: AuthClaimStore;
  replyRateLimiter: RateLimiter;
  reactionRateLimiter: RateLimiter;
  proxyRateLimiter: RateLimiter;
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

const EXTENSION_ORIGIN =
  /^(chrome-extension|moz-extension|safari-web-extension):\/\/([a-z0-9-]+)\/?$/i;

/**
 * Normalizes a browser-extension origin (`chrome-extension://<id>`,
 * `moz-extension://<uuid>`, `safari-web-extension://<uuid>`). Returns null
 * for anything else, including web origins.
 *
 * The ID keeps its case: browsers compare `Access-Control-Allow-Origin`
 * byte for byte with the `Origin` they sent, and Safari's UUIDs are
 * uppercase, so a lowercased echo would fail CORS.
 */
export const parseExtensionOrigin = (value: string): string | null => {
  const match = EXTENSION_ORIGIN.exec(value.trim());
  if (!match) return null;
  return `${match[1]!.toLowerCase()}://${match[2]!}`;
};

/** the public Constellation backlink index */
export const DEFAULT_CONSTELLATION = "https://constellation.microcosm.blue";

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
  const allowedOrigins = config.allowedOrigins?.map((value) =>
    normalizeOrigin(value, "allowedOrigins"),
  );
  const scope = config.scope ?? DEFAULT_SCOPE;
  const permissionSets = resolvePermissionSets(config, scope, allowedOrigins);
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

  const constellation = new URL(config.constellation ?? DEFAULT_CONSTELLATION);
  if (
    constellation.protocol !== "https:" &&
    constellation.protocol !== "http:"
  ) {
    throw new Error("constellation must be an http(s) URL");
  }

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
    sessionRefreshWindowSeconds:
      config.sessionRefreshWindowSeconds ?? 7 * 24 * 60 * 60,
    sessionMode: config.sessionMode ?? "bearer",
    sessionCookieName,
    scope,
    permissionSets,
    appView: config.appView ?? "https://public.api.bsky.app",
    constellation: constellation.origin,
    commentStream: resolveCommentStreamConfig(config.commentStream),
    authClaimStore:
      config.authClaimStore ?? createMemoryAuthClaimStore(120_000),
    replyRateLimiter:
      config.replyRateLimiter ?? createMemoryRateLimiter(10, 10 * 60_000),
    reactionRateLimiter:
      config.reactionRateLimiter ?? createMemoryRateLimiter(60, 10 * 60_000),
    proxyRateLimiter:
      config.proxyRateLimiter ?? createMemoryRateLimiter(600, 10 * 60_000),
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

const DEFAULT_SCOPE =
  "atproto repo:app.bsky.feed.post?action=create repo:app.bsky.feed.like?action=create&action=delete repo:app.bsky.feed.repost?action=create&action=delete";

/** a website or extension origin from config, or a construction error */
const normalizeOrigin = (value: string, field: string): string => {
  const extension = parseExtensionOrigin(value);
  if (extension) return extension;
  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    throw new Error(`${field} contains an invalid URL: ${value}`);
  }
  if (origin === "null") {
    throw new Error(`${field} entry has no origin: ${value}`);
  }
  return origin;
};

/** set names appear in URLs and store keys */
const PERMISSION_SET_NAME = /^[a-z][a-z0-9-]{0,31}$/;
/** an NSID: reversed domain authority plus a name segment */
export const NSID =
  /^[a-zA-Z](?:[a-zA-Z0-9-]{0,62})(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62})){1,}\.[a-zA-Z][a-zA-Z0-9]{0,62}$/;
/** a DID with a service fragment, e.g. did:web:api.bsky.app#bsky_appview */
const SERVICE_DID = /^did:[a-z]+:[a-zA-Z0-9._:%-]+#[a-zA-Z0-9._-]+$/;

/**
 * Prefixes every key of a key-value store, so each permission set's client
 * keeps its own logins and flow state in the host's existing store. The
 * default client's keys stay unprefixed, so logins stored before permission
 * sets existed remain valid. `/` cannot occur in a DID or an OAuth state
 * key, so prefixed keys never collide with unprefixed ones.
 */
const prefixStore = <S extends KeyedStore>(store: S, prefix: string): S => {
  const keyed: KeyedStore = store;
  return {
    get: (key, ...rest) => keyed.get(`${prefix}${key}`, ...rest),
    set: (key, ...rest) => keyed.set(`${prefix}${key}`, ...rest),
    del: (key, ...rest) => keyed.del(`${prefix}${key}`, ...rest),
  } satisfies KeyedStore as S;
};

/** the shape shared by the OAuth state and session stores */
interface KeyedStore {
  get(key: string, ...rest: unknown[]): unknown;
  set(key: string, ...rest: unknown[]): unknown;
  del(key: string, ...rest: unknown[]): unknown;
}

const resolvePermissionSets = (
  config: ServiceConfig,
  scope: string,
  allowedOrigins: readonly string[] | undefined,
): Record<string, ResolvedPermissionSet> => {
  const resolved: Record<string, ResolvedPermissionSet> = {};
  for (const [name, set] of Object.entries(config.permissionSets ?? {})) {
    if (!PERMISSION_SET_NAME.test(name)) {
      throw new Error(
        `permissionSets: "${name}" must be lowercase letters, digits, and dashes`,
      );
    }
    if (!set.clientName.trim() || !set.description.trim()) {
      throw new Error(
        `permissionSets.${name} needs a clientName and a description`,
      );
    }
    if (set.origins.length === 0) {
      throw new Error(
        `permissionSets.${name}.origins must list at least one origin`,
      );
    }
    const origins = set.origins.map((value) =>
      normalizeOrigin(value, `permissionSets.${name}.origins`),
    );
    for (const origin of origins) {
      if (allowedOrigins && !allowedOrigins.includes(origin)) {
        throw new Error(
          `permissionSets.${name}: ${origin} is not in allowedOrigins`,
        );
      }
    }
    if (set.methods.length === 0) {
      throw new Error(`permissionSets.${name}.methods must not be empty`);
    }
    const rpcScopes = set.methods.map(({ nsid, aud }) => {
      if (!NSID.test(nsid)) {
        throw new Error(`permissionSets.${name}: invalid NSID ${nsid}`);
      }
      if (!SERVICE_DID.test(aud)) {
        throw new Error(
          `permissionSets.${name}: aud must be a DID with a service fragment, got ${aud}`,
        );
      }
      return `rpc:${nsid}?aud=${aud.replace("#", "%23")}`;
    });
    const prefix = `sets/${name}/`;
    resolved[name] = {
      ...set,
      name,
      clientName: set.clientName.trim(),
      description: set.description.trim(),
      origins,
      scope: [scope, ...rpcScopes].join(" "),
      stateStore: prefixStore(config.stateStore, prefix),
      sessionStore: prefixStore(config.sessionStore, prefix),
    };
  }
  return resolved;
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
