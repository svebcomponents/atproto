import {
  parseThreadRef,
  resolveThreadUri,
} from "@svebcomponents/atproto.client";

import {
  CommentStreamCapacityError,
  createCommentStreamBroker,
  type CommentStreamBroker,
  type WebSocketFactory,
} from "./commentStream.js";
import {
  resolveConfig,
  type ServiceConfig,
  type ResolvedServiceConfig,
} from "./config.js";
import { buildOAuthClient, type OAuthBridgeClient } from "./oauthClient.js";
import {
  callbackPage,
  errorPage,
  signInPage,
  successPage,
  type SignInPageRenderer,
  type SignInPageRenderProps,
} from "./pages.js";
import {
  ReactionValidationError,
  validateOwnRecordUri,
  validateReactionSubject,
} from "./reactionValidation.js";
import {
  ReplyValidationError,
  type PostRef,
  validateReplyRequest,
} from "./replyValidation.js";
import type { MetricsTotals } from "./metrics.js";
import {
  createSessionTokenIssuer,
  type SessionTokenClaims,
  type SessionTokenIssuer,
} from "./sessionToken.js";

/**
 * Publishable operational numbers. Counts and gauges only: no origins, no
 * reader identifiers, nothing that describes an individual visit.
 */
export interface ServiceStats {
  /** right now, in this process */
  live: { threads: number; subscribers: number };
  /** since the counter store was first written */
  totals: MetricsTotals;
}

export interface AtprotoCommentsService {
  /**
   * Handles requests under `config.basePath`; returns `undefined` for
   * anything outside it so hosts can fall through to their own routing.
   */
  fetch(request: Request): Promise<Response | undefined>;
  /**
   * Operational counters, for a host that wants to render them itself.
   *
   * `live` is this process's view. Accurate for a single instance; behind a
   * load balancer it describes one worker, not the deployment.
   */
  stats(): Promise<ServiceStats>;
}

/** how long the public stats response may be reused */
const STATS_CACHE_MS = 30_000;

const json = (body: unknown, status = 200, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const html = (body: string, status = 200, headers?: HeadersInit): Response =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });

const jsonError = (
  status: number,
  error: string,
  message: string,
  headers?: HeadersInit,
): Response => json({ error, message }, status, headers);

/** validates and normalizes an embedding site origin */
const parseOrigin = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
};

/**
 * Same as {@link parseOrigin}, but also enforces `config.allowedOrigins` when
 * the deployment configured one. Used everywhere an origin is accepted from
 * the network, so an unlisted site can neither start a sign-in nor hold a
 * session.
 */
const parseAllowedOrigin = (
  value: string | null,
  config: ResolvedServiceConfig,
): string | null => {
  const origin = parseOrigin(value);
  if (origin === null) return null;
  if (config.allowedOrigins && !config.allowedOrigins.includes(origin)) {
    return null;
  }
  return origin;
};

/**
 * Methods that create or destroy records in the user's repo. These require a
 * proven `Origin`; see {@link requiresOriginHeader}.
 */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Validates the no-JS redirect-back target for the cookie-mode sign-in flow:
 * must be same-origin as the embedding site being authorized, so a forged
 * `return` can't redirect elsewhere once a real sign-in completes.
 */
const parseReturnUrl = (
  value: string | null,
  origin: string,
): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.origin !== origin) return null;
    // Keep only origin + path. The query string and fragment are no use as a
    // redirect target and are the part of a URL most likely to carry
    // something private — a search term, a share token, a session id. This is
    // enforced here rather than trusting the caller, because the value can
    // also arrive from the `Referer` header, which the browser fills in and
    // no attribute on a <form> can suppress.
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
};

const readCookie = (request: Request, name: string): string | undefined => {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== name) continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return undefined;
    }
  }
  return undefined;
};

const sessionCookie = (
  config: ResolvedServiceConfig,
  value: string,
  maxAge: number,
): string =>
  [
    `${config.sessionCookieName}=${encodeURIComponent(value)}`,
    `Path=${config.basePath}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(config.isLoopback ? [] : ["Secure"]),
  ].join("; ");

const clearSessionCookie = (config: ResolvedServiceConfig): string =>
  sessionCookie(config, "", 0);

/** true for a plain HTML <form> POST (no-JS fallback), false for a JS fetch call */
const isFormSubmission = (request: Request): boolean => {
  const contentType = request.headers.get("content-type") ?? "";
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
};

const formValue = (form: FormData, key: string): string | undefined => {
  const value = form.get(key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/**
 * Where to send a no-JS form submission back to: an explicit hidden `return`
 * field if the page supplied one, else the Referer header. Either way it must
 * be same-origin as the caller's session — same rule as the OAuth `return`.
 */
const pickRedirectTarget = (
  request: Request,
  explicitReturn: string | undefined,
  origin: string,
): string | undefined =>
  parseReturnUrl(explicitReturn ?? request.headers.get("referer"), origin) ??
  undefined;

type ActionResult =
  | { ok: true; uri: string; cid: string }
  | {
      ok: false;
      status: number;
      error: string;
      message: string;
      headers?: HeadersInit;
    };

/** formats an ActionResult as JSON (JS path) or a redirect/error page (form path) */
const respondAction = (
  isForm: boolean,
  cors: HeadersInit,
  result: ActionResult,
  redirectTo: string | undefined,
): Response => {
  if (!result.ok) {
    return isForm
      ? html(errorPage(result.message), result.status, result.headers)
      : jsonError(result.status, result.error, result.message, {
          ...cors,
          ...result.headers,
        });
  }
  if (!isForm) return json({ uri: result.uri, cid: result.cid }, 200, cors);
  return redirectTo
    ? new Response(null, { status: 303, headers: { location: redirectTo } })
    : html(successPage());
};

const authenticateCookie = async (
  request: Request,
  requestOrigin: string | null,
  config: ResolvedServiceConfig,
): Promise<SessionTokenClaims | null> => {
  const sid = readCookie(request, config.sessionCookieName);
  if (!sid) return null;
  const session = await config.serviceSessionStore.get(sid);
  if (!session) return null;
  const createdAt = Date.parse(session.createdAt);
  if (
    Number.isNaN(createdAt) ||
    Date.now() - createdAt > config.sessionTtlSeconds * 1_000
  ) {
    await config.serviceSessionStore.del(sid);
    return null;
  }
  if (requestOrigin !== null && requestOrigin !== session.origin) return null;
  return { did: session.did, origin: session.origin, sid };
};

/**
 * Carried through the OAuth round trip in the `state` parameter.
 *
 * There is deliberately no CSRF nonce of our own here: `@atproto/
 * oauth-client-node` generates and verifies the `state` value against its
 * own state store, so replay protection for the authorization round trip is
 * already handled a layer down. An earlier `nonce` field on this interface
 * was never read by the callback — it looked like a control but wasn't one.
 */
interface AuthorizeState {
  origin: string;
  /** claim nonce the opener polls with (undefined for the redirect fallback) */
  claim?: string;
  /** no-JS flow: page to redirect back to once signed in (cookie mode only) */
  return?: string;
}

export interface CreateServiceOptions {
  /** test seam: bypasses NodeOAuthClient construction */
  oauthClient?: OAuthBridgeClient;
  /** test/runtime seam for the Spacedust websocket transport */
  webSocketFactory?: WebSocketFactory;
  /** test seam: bypasses the default shared per-thread stream broker */
  commentStreamBroker?: CommentStreamBroker;
  /**
   * Replaces only the handle-entry page. OAuth callbacks and session handoff
   * remain bridge-owned. The renderer may return a complete HTML document.
   */
  renderSignInPage?: SignInPageRenderer;
}

export const createAtprotoCommentsService = (
  serviceConfig: ServiceConfig,
  options: CreateServiceOptions = {},
): AtprotoCommentsService => {
  const config = resolveConfig(serviceConfig);
  const renderSignInPage = options.renderSignInPage ?? signInPage;
  const clientPromise: Promise<OAuthBridgeClient> = options.oauthClient
    ? Promise.resolve(options.oauthClient)
    : buildOAuthClient(config);

  const tokens = createSessionTokenIssuer({
    secret: config.sessionSecret,
    audience: config.publicUrl,
    ttlSeconds: config.sessionTtlSeconds,
    serviceSessionStore: config.serviceSessionStore,
  });
  const commentStreams =
    options.commentStreamBroker ??
    createCommentStreamBroker(config.commentStream, options.webSocketFactory);

  const readStats = async (): Promise<ServiceStats> => {
    const live = commentStreams.stats();
    return {
      live: { threads: live.threads, subscribers: live.subscribers },
      totals: await config.metrics.totals(),
    };
  };

  // Served to anyone, so it is cached rather than recomputed per request.
  let statsCache: { at: number; value: ServiceStats } | undefined;
  const cachedStats = async (): Promise<ServiceStats> => {
    if (statsCache && Date.now() - statsCache.at < STATS_CACHE_MS) {
      return statsCache.value;
    }
    const value = await readStats();
    statsCache = { at: Date.now(), value };
    return value;
  };

  return {
    stats: readStats,
    async fetch(request) {
      const url = new URL(request.url);
      if (
        url.pathname !== config.basePath &&
        !url.pathname.startsWith(`${config.basePath}/`)
      ) {
        return undefined;
      }
      const route = url.pathname.slice(config.basePath.length);

      // Public, unauthenticated, and deliberately dull: whole-service counts
      // with no origins and nothing about any reader.
      if (request.method === "GET" && route === "/api/stats") {
        return json(await cachedStats(), 200, {
          "access-control-allow-origin": "*",
          "cache-control": `public, max-age=${Math.floor(STATS_CACHE_MS / 1000)}`,
        });
      }

      // the component calls /api/* cross-origin from embedding sites
      if (route.startsWith("/api/")) {
        return handleApi(
          request,
          route,
          config,
          tokens,
          clientPromise,
          commentStreams,
        );
      }

      switch (`${request.method} ${route}`) {
        case "GET /client-metadata.json":
          return json((await clientPromise).clientMetadata);
        case "GET /jwks.json":
          return json((await clientPromise).jwks);
        case "GET /oauth/start":
          return handleStart(url, config, clientPromise, renderSignInPage);
        case "GET /oauth/callback":
          return handleCallback(url, config, tokens, clientPromise);
        default:
          return jsonError(404, "NotFound", "Unknown route");
      }
    },
  };
};

const handleStart = async (
  url: URL,
  config: ResolvedServiceConfig,
  clientPromise: Promise<OAuthBridgeClient>,
  renderSignInPage: SignInPageRenderer,
): Promise<Response> => {
  const origin = parseAllowedOrigin(url.searchParams.get("origin"), config);
  if (!origin) {
    return html(
      errorPage("This site is not allowed to sign in with this service."),
      400,
    );
  }
  const handle = url.searchParams.get("handle")?.trim() ?? "";
  const claim = url.searchParams.get("claim")?.trim();
  const returnTo = parseReturnUrl(url.searchParams.get("return"), origin);
  const startUrl = `${config.basePath}/oauth/start`;

  if (!handle) {
    return html(
      await renderSignInPage({
        ...signInPageProps(config, startUrl, origin),
        // preserved as hidden fields so the handle submission carries them back
        ...(claim ? { claim } : {}),
        ...(returnTo ? { returnTo } : {}),
      }),
    );
  }

  try {
    const state: AuthorizeState = {
      origin,
      ...(claim ? { claim } : {}),
      ...(returnTo ? { return: returnTo } : {}),
    };
    const client = await clientPromise;
    const authorizeUrl = await client.authorize(handle, {
      state: JSON.stringify(state),
    });
    return new Response(null, {
      status: 302,
      headers: { location: authorizeUrl.toString() },
    });
  } catch {
    return html(
      await renderSignInPage({
        ...signInPageProps(config, startUrl, origin),
        ...(claim ? { claim } : {}),
        ...(returnTo ? { returnTo } : {}),
        error: `Could not start sign-in for "${handle}" — check the handle and try again.`,
      }),
      400,
    );
  }
};

const signInPageProps = (
  config: ResolvedServiceConfig,
  actionUrl: string,
  origin: string,
): SignInPageRenderProps => {
  const pageTitle = config.oauthPage?.title;
  const brand = config.oauthPage?.brand;
  const links = config.oauthPage?.links;
  return {
    clientName: config.clientName,
    documentTitle: pageTitle ?? `Sign in to ${config.clientName}`,
    title: pageTitle ?? "Sign in to the ATmosphere to comment",
    brandName: brand?.name ?? config.clientName,
    showBrand: Boolean(brand || config.productUrl),
    ...(brand?.logoUrl ? { brandLogoUrl: brand.logoUrl } : {}),
    ...(brand?.homeUrl || config.productUrl
      ? { brandHomeUrl: brand?.homeUrl ?? config.productUrl }
      : {}),
    ...(config.oauthPage?.theme?.accent
      ? { accent: config.oauthPage.theme.accent }
      : {}),
    actionUrl,
    origin,
    ...(links?.privacy || config.privacyUrl
      ? { privacyUrl: links?.privacy ?? config.privacyUrl }
      : {}),
    ...(links?.support ? { supportUrl: links.support } : {}),
    ...(config.productUrl ? { productUrl: config.productUrl } : {}),
  };
};

const handleCallback = async (
  url: URL,
  config: ResolvedServiceConfig,
  tokens: SessionTokenIssuer,
  clientPromise: Promise<OAuthBridgeClient>,
): Promise<Response> => {
  let did: string;
  let origin: string;
  let claimNonce: string | undefined;
  let returnTo: string | undefined;
  try {
    const client = await clientPromise;
    const { session, state } = await client.callback(url.searchParams);
    did = session.did;
    const parsedState = JSON.parse(state ?? "") as Partial<AuthorizeState>;
    const parsedOrigin = parseAllowedOrigin(parsedState.origin ?? null, config);
    if (!parsedOrigin) throw new Error("state is missing an allowed origin");
    origin = parsedOrigin;
    claimNonce = parsedState.claim;
    returnTo = parseReturnUrl(parsedState.return ?? null, origin) ?? undefined;
  } catch {
    return html(
      errorPage("Sign-in failed. Close this window and try again."),
      400,
    );
  }

  const profile = await fetchProfile(did, config);
  const sid = crypto.randomUUID();
  await config.serviceSessionStore.set(sid, {
    did,
    origin,
    createdAt: new Date().toISOString(),
    ...profile,
  });
  config.metrics.record(origin, "signIn");
  const token =
    config.sessionMode === "bearer"
      ? await tokens.mint({ did, origin, sid })
      : undefined;
  const handoff = {
    ...(token ? { token } : {}),
    did,
    ...profile,
  };

  // Primary handoff: stash the claim for the opener to poll. OAuth providers
  // set COOP which severs window.opener, so postMessage (below) can't be
  // relied on — it's kept only as a same-origin fast path.
  //
  // The claim records the origin this sign-in was authorized for, and
  // retrieval requires a matching `Origin`. The nonce travels as a query
  // parameter on a public endpoint, so it is not a secret an attacker can be
  // kept out of — but the origin is something they cannot forge from a
  // browser, and the token is only ever useful on that origin anyway.
  if (claimNonce) {
    await config.authClaimStore.set(claimNonce, { origin, ...handoff });
  }

  // No-JS flow: a plain top-level redirect back to the exact page the reader
  // started from, with the session now set as a first-party cookie. Only
  // valid in cookie mode — bearer sessions need JS to store the token, so
  // there's nowhere useful to redirect a no-JS visitor back to.
  if (config.sessionMode === "cookie" && returnTo) {
    return new Response(null, {
      status: 303,
      headers: {
        location: returnTo,
        "set-cookie": sessionCookie(config, sid, config.sessionTtlSeconds),
      },
    });
  }

  return html(
    callbackPage({
      origin,
      payload: handoff,
    }),
    200,
    config.sessionMode === "cookie"
      ? {
          "set-cookie": sessionCookie(config, sid, config.sessionTtlSeconds),
        }
      : undefined,
  );
};

/** best-effort public profile snapshot for the signed-in chrome */
const fetchProfile = async (
  did: string,
  config: ResolvedServiceConfig,
): Promise<{ handle?: string; displayName?: string; avatarUrl?: string }> => {
  try {
    const response = await config.fetch(
      `${config.appView}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    if (!response.ok) return {};
    const profile = (await response.json()) as {
      handle?: string;
      displayName?: string;
      avatar?: string;
    };
    return {
      ...(profile.handle ? { handle: profile.handle } : {}),
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
      ...(profile.avatar ? { avatarUrl: profile.avatar } : {}),
    };
  } catch {
    return {};
  }
};

const corsHeaders = (origin: string): HeadersInit => ({
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
  vary: "origin",
});

const handleApi = async (
  request: Request,
  route: string,
  config: ResolvedServiceConfig,
  tokens: SessionTokenIssuer,
  clientPromise: Promise<OAuthBridgeClient>,
  commentStreams: CommentStreamBroker,
): Promise<Response> => {
  const requestOrigin = parseAllowedOrigin(
    request.headers.get("origin"),
    config,
  );

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...(requestOrigin ? corsHeaders(requestOrigin) : {}),
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "86400",
      },
    });
  }

  // Claim retrieval runs before the bearer gate — the session it hands back
  // is the thing the caller is trying to obtain. It is guarded by the origin
  // the sign-in was authorized for, NOT by the nonce: the nonce arrives as a
  // `?claim=` parameter on a public endpoint, so anyone can craft a sign-in
  // link carrying a nonce of their choosing and then poll for the result.
  // Requiring a matching `Origin` means only the site the reader actually
  // signed in to can collect the session. One-time read.
  if (request.method === "GET" && route === "/api/session/claim") {
    const cors = requestOrigin ? corsHeaders(requestOrigin) : {};
    const nonce = new URL(request.url).searchParams.get("nonce");
    const claim = nonce ? await config.authClaimStore.take(nonce) : undefined;
    if (!claim) {
      return jsonError(404, "NotReady", "No claim for this nonce yet", cors);
    }
    // A same-origin fetch sends no `Origin` header, which is only legitimate
    // when the embedding site *is* the service (a self-hosted, same-origin
    // deployment). Any cross-origin caller must prove its origin.
    const originMatches =
      requestOrigin === null
        ? claim.origin === config.publicUrl
        : requestOrigin === claim.origin;
    if (!originMatches) {
      return jsonError(
        403,
        "OriginMismatch",
        "This claim belongs to a different site",
        cors,
      );
    }
    const { origin: _claimOrigin, ...handoff } = claim;
    return json(handoff, 200, cors);
  }

  // Watching public replies does not require an account. Spacedust only
  // supplies the record URI; clients can refetch the thread from their
  // AppView when a `comment` event arrives.
  if (request.method === "GET" && route === "/api/comments/stream") {
    return handleCommentStream(request, config, commentStreams);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  // Origin binding is a browser-enforced control: browsers always attach an
  // `Origin` header to cross-origin requests and never let a page forge one.
  // A non-browser client simply omits it — so treating "absent" as "nothing
  // to check" would let any leaked token create records from anywhere, which
  // is precisely what the binding exists to prevent. Every request that
  // writes to the user's repo must therefore carry a proven origin, in both
  // session modes. Reads (GET) stay permissive so a same-origin deployment,
  // where browsers omit the header, keeps working.
  if (MUTATING_METHODS.has(request.method) && requestOrigin === null) {
    return jsonError(
      403,
      "OriginRequired",
      "This request must be made from a browser on the site you signed in to",
    );
  }

  const claims =
    config.sessionMode === "cookie"
      ? await authenticateCookie(request, requestOrigin, config)
      : bearer
        ? await tokens.verify(bearer, requestOrigin)
        : null;
  if (!claims) {
    return jsonError(
      401,
      "InvalidSession",
      "Missing, expired, or origin-mismatched session",
      requestOrigin ? corsHeaders(requestOrigin) : {},
    );
  }
  const cors = corsHeaders(claims.origin);

  switch (`${request.method} ${route}`) {
    case "GET /api/session": {
      const session = await config.serviceSessionStore.get(claims.sid);
      return json(
        {
          did: claims.did,
          handle: session?.handle,
          displayName: session?.displayName,
          avatarUrl: session?.avatarUrl,
        },
        200,
        cors,
      );
    }

    case "POST /api/session/refresh": {
      if (config.sessionMode === "cookie") {
        const session = await config.serviceSessionStore.get(claims.sid);
        if (!session) {
          return jsonError(401, "InvalidSession", "Session expired", cors);
        }
        await config.serviceSessionStore.set(claims.sid, {
          ...session,
          createdAt: new Date().toISOString(),
        });
        return json({ ok: true }, 200, {
          ...cors,
          "set-cookie": sessionCookie(
            config,
            claims.sid,
            config.sessionTtlSeconds,
          ),
        });
      }
      const token = await tokens.mint(claims);
      return json({ token }, 200, cors);
    }

    case "POST /api/session/logout": {
      await config.serviceSessionStore.del(claims.sid);
      // Also give up the ATProto grant. Without this, signing out ends only
      // the browser's session with the bridge while the refresh token that
      // lets the bridge post as this account stays on disk indefinitely —
      // "sign out" has to mean the service can no longer act as the user.
      //
      // Token sets are keyed by DID, so a reader signed in on two sites at
      // once ends both by signing out of either. That is the safer default:
      // the alternative silently keeps a live credential for an account
      // whose owner just asked to be signed out.
      try {
        await (await clientPromise).revoke(claims.did);
      } catch {
        // Best-effort: the PDS may be unreachable, or the grant already
        // gone. The browser session is deleted either way, and the stored
        // token set expires on its own (see the session store's TTL).
      }
      return json(
        { ok: true },
        200,
        config.sessionMode === "cookie"
          ? { ...cors, "set-cookie": clearSessionCookie(config) }
          : cors,
      );
    }

    case "POST /api/reply": {
      const isForm = isFormSubmission(request);
      if (!(await config.replyRateLimiter(claims.did))) {
        config.metrics.record(claims.origin, "rateLimited");
        return respondAction(
          isForm,
          cors,
          {
            ok: false,
            status: 429,
            error: "RateLimited",
            message: "Too many replies — try again in a few minutes",
            headers: { "retry-after": "600" },
          },
          undefined,
        );
      }

      let input: unknown;
      let redirectTo: string | undefined;
      if (isForm) {
        const form = await request.formData().catch(() => undefined);
        redirectTo = form
          ? pickRedirectTarget(
              request,
              formValue(form, "return"),
              claims.origin,
            )
          : undefined;
        input = form && {
          root: {
            uri: formValue(form, "rootUri"),
            cid: formValue(form, "rootCid"),
          },
          parent: {
            uri: formValue(form, "parentUri"),
            cid: formValue(form, "parentCid"),
          },
          text: formValue(form, "text"),
        };
      } else {
        input = await request.json().catch(() => null);
      }

      let reply: ReturnType<typeof validateReplyRequest>;
      try {
        reply = validateReplyRequest(input);
      } catch (error) {
        const message =
          error instanceof ReplyValidationError
            ? error.message
            : "Invalid request body";
        return respondAction(
          isForm,
          cors,
          { ok: false, status: 400, error: "InvalidRequest", message },
          undefined,
        );
      }
      const result = await postReply(claims.did, reply, clientPromise);
      if (result.ok) config.metrics.record(claims.origin, "reply");
      return respondAction(isForm, cors, result, redirectTo);
    }

    case "POST /api/like":
    case "POST /api/repost": {
      const collection =
        route === "/api/like" ? "app.bsky.feed.like" : "app.bsky.feed.repost";
      const isForm = isFormSubmission(request);
      if (!(await config.reactionRateLimiter(claims.did))) {
        config.metrics.record(claims.origin, "rateLimited");
        return respondAction(
          isForm,
          cors,
          {
            ok: false,
            status: 429,
            error: "RateLimited",
            message: "Too many actions — try again in a few minutes",
            headers: { "retry-after": "600" },
          },
          undefined,
        );
      }

      let input: unknown;
      let redirectTo: string | undefined;
      if (isForm) {
        const form = await request.formData().catch(() => undefined);
        redirectTo = form
          ? pickRedirectTarget(
              request,
              formValue(form, "return"),
              claims.origin,
            )
          : undefined;
        input = form && {
          uri: formValue(form, "uri"),
          cid: formValue(form, "cid"),
        };
      } else {
        input = await request.json().catch(() => null);
      }

      let subject: PostRef;
      try {
        subject = validateReactionSubject(input);
      } catch (error) {
        const message =
          error instanceof ReactionValidationError
            ? error.message
            : "Invalid request body";
        return respondAction(
          isForm,
          cors,
          { ok: false, status: 400, error: "InvalidRequest", message },
          undefined,
        );
      }
      const result = await createReaction(
        claims.did,
        collection,
        subject,
        clientPromise,
      );
      if (result.ok) config.metrics.record(claims.origin, "reaction");
      return respondAction(isForm, cors, result, redirectTo);
    }

    case "DELETE /api/like":
    case "DELETE /api/repost": {
      const collection =
        route === "/api/like" ? "app.bsky.feed.like" : "app.bsky.feed.repost";
      let ref;
      try {
        ref = validateOwnRecordUri(
          new URL(request.url).searchParams.get("uri"),
          collection,
          claims.did,
        );
      } catch (error) {
        const message =
          error instanceof ReactionValidationError
            ? error.message
            : "Invalid uri";
        return jsonError(400, "InvalidRequest", message, cors);
      }
      return deleteReaction(
        claims.did,
        collection,
        ref.rkey,
        clientPromise,
        cors,
      );
    }

    default:
      return jsonError(404, "NotFound", "Unknown route", cors);
  }
};

const handleCommentStream = async (
  request: Request,
  config: ResolvedServiceConfig,
  commentStreams: CommentStreamBroker,
): Promise<Response> => {
  const input = new URL(request.url).searchParams.get("thread") ?? "";
  const ref = parseThreadRef(input);
  if (!ref || ref.collection !== "app.bsky.feed.post") {
    return jsonError(
      400,
      "InvalidThread",
      "thread must be an AT URI or bsky.app post URL",
      { "access-control-allow-origin": "*" },
    );
  }

  let threadUri: string;
  try {
    threadUri = await resolveThreadUri(ref, {
      appView: config.appView,
      fetch: config.fetch,
      signal: request.signal,
    });
  } catch {
    return jsonError(400, "InvalidThread", "Could not resolve the thread", {
      "access-control-allow-origin": "*",
    });
  }

  try {
    const stream = commentStreams.subscribe(threadUri, request.signal);
    config.metrics.record(
      parseOrigin(request.headers.get("origin")),
      "streamConnect",
    );
    return new Response(stream, {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof CommentStreamCapacityError) {
      return jsonError(503, "StreamCapacity", error.message, {
        "access-control-allow-origin": "*",
        "retry-after": "30",
      });
    }
    throw error;
  }
};

const postReply = async (
  did: string,
  reply: ReturnType<typeof validateReplyRequest>,
  clientPromise: Promise<OAuthBridgeClient>,
): Promise<ActionResult> => {
  let session;
  try {
    const client = await clientPromise;
    session = await client.restore(did);
  } catch {
    return {
      ok: false,
      status: 401,
      error: "SessionExpired",
      message: "Your atmosphere authorization expired — sign in again",
    };
  }

  const record = {
    $type: "app.bsky.feed.post",
    text: reply.text,
    createdAt: new Date().toISOString(),
    reply: { root: reply.root, parent: reply.parent },
    ...(reply.langs ? { langs: reply.langs } : {}),
  };

  const response = await session.fetchHandler(
    "/xrpc/com.atproto.repo.createRecord",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.post",
        record,
      }),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    return {
      ok: false,
      status: response.status === 429 ? 429 : 502,
      error: "PdsError",
      message:
        body.message ?? `PDS rejected the post (HTTP ${response.status})`,
    };
  }

  const created = (await response.json()) as { uri: string; cid: string };
  return { ok: true, uri: created.uri, cid: created.cid };
};

type ReactionCollection = "app.bsky.feed.like" | "app.bsky.feed.repost";

const createReaction = async (
  did: string,
  collection: ReactionCollection,
  subject: PostRef,
  clientPromise: Promise<OAuthBridgeClient>,
): Promise<ActionResult> => {
  let session;
  try {
    const client = await clientPromise;
    session = await client.restore(did);
  } catch {
    return {
      ok: false,
      status: 401,
      error: "SessionExpired",
      message: "Your atmosphere authorization expired — sign in again",
    };
  }

  const record = {
    $type: collection,
    subject: { uri: subject.uri, cid: subject.cid },
    createdAt: new Date().toISOString(),
  };

  const response = await session.fetchHandler(
    "/xrpc/com.atproto.repo.createRecord",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: did, collection, record }),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    return {
      ok: false,
      status: response.status === 429 ? 429 : 502,
      error: "PdsError",
      message:
        body.message ?? `PDS rejected the request (HTTP ${response.status})`,
    };
  }

  const created = (await response.json()) as { uri: string; cid: string };
  return { ok: true, uri: created.uri, cid: created.cid };
};

const deleteReaction = async (
  did: string,
  collection: ReactionCollection,
  rkey: string,
  clientPromise: Promise<OAuthBridgeClient>,
  cors: HeadersInit,
): Promise<Response> => {
  let session;
  try {
    const client = await clientPromise;
    session = await client.restore(did);
  } catch {
    return jsonError(
      401,
      "SessionExpired",
      "Your atmosphere authorization expired — sign in again",
      cors,
    );
  }

  const response = await session.fetchHandler(
    "/xrpc/com.atproto.repo.deleteRecord",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: did, collection, rkey }),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    return jsonError(
      response.status === 429 ? 429 : 502,
      "PdsError",
      body.message ?? `PDS rejected the request (HTTP ${response.status})`,
      cors,
    );
  }

  return json({ ok: true }, 200, cors);
};
