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
import { callbackPage, errorPage, signInPage } from "./pages.js";
import {
  ReplyValidationError,
  validateReplyRequest,
} from "./replyValidation.js";
import {
  createSessionTokenIssuer,
  type SessionTokenClaims,
  type SessionTokenIssuer,
} from "./sessionToken.js";

export interface AtprotoCommentsService {
  /**
   * Handles requests under `config.basePath`; returns `undefined` for
   * anything outside it so hosts can fall through to their own routing.
   */
  fetch(request: Request): Promise<Response | undefined>;
}

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

interface AuthorizeState {
  origin: string;
  /** CSRF nonce */
  nonce: string;
  /** claim nonce the opener polls with (undefined for the redirect fallback) */
  claim?: string;
}

export interface CreateServiceOptions {
  /** test seam: bypasses NodeOAuthClient construction */
  oauthClient?: OAuthBridgeClient;
  /** test/runtime seam for the Spacedust websocket transport */
  webSocketFactory?: WebSocketFactory;
  /** test seam: bypasses the default shared per-thread stream broker */
  commentStreamBroker?: CommentStreamBroker;
}

export const createAtprotoCommentsService = (
  serviceConfig: ServiceConfig,
  options: CreateServiceOptions = {},
): AtprotoCommentsService => {
  const config = resolveConfig(serviceConfig);
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

  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (
        url.pathname !== config.basePath &&
        !url.pathname.startsWith(`${config.basePath}/`)
      ) {
        return undefined;
      }
      const route = url.pathname.slice(config.basePath.length);

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
          return handleStart(url, config, clientPromise);
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
): Promise<Response> => {
  const origin = parseOrigin(url.searchParams.get("origin"));
  if (!origin) {
    return html(errorPage("Missing or invalid origin parameter"), 400);
  }
  const handle = url.searchParams.get("handle")?.trim() ?? "";
  const claim = url.searchParams.get("claim")?.trim();
  const startUrl = `${config.basePath}/oauth/start`;

  if (!handle) {
    return html(
      signInPage({
        clientName: config.clientName,
        actionUrl: startUrl,
        origin,
        // preserved as a hidden field so the handle submission carries it back
        ...(claim ? { claim } : {}),
      }),
    );
  }

  try {
    const state: AuthorizeState = {
      origin,
      nonce: crypto.randomUUID(),
      ...(claim ? { claim } : {}),
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
      signInPage({
        clientName: config.clientName,
        actionUrl: startUrl,
        origin,
        ...(claim ? { claim } : {}),
        error: `Could not start sign-in for "${handle}" — check the handle and try again.`,
      }),
      400,
    );
  }
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
  try {
    const client = await clientPromise;
    const { session, state } = await client.callback(url.searchParams);
    did = session.did;
    const parsedState = JSON.parse(state ?? "") as Partial<AuthorizeState>;
    const parsedOrigin = parseOrigin(parsedState.origin ?? null);
    if (!parsedOrigin) throw new Error("state is missing the origin");
    origin = parsedOrigin;
    claimNonce = parsedState.claim;
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
  if (claimNonce) {
    await config.authClaimStore.set(claimNonce, handoff);
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
  const requestOrigin = parseOrigin(request.headers.get("origin"));

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...(requestOrigin ? corsHeaders(requestOrigin) : {}),
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "86400",
      },
    });
  }

  // Claim retrieval is authenticated by the unguessable nonce itself (the
  // opener generated it and only it knows it), so it runs before the bearer
  // gate. The returned token is origin-bound, so a leaked claim is still
  // useless off its origin. One-time read.
  if (request.method === "GET" && route === "/api/session/claim") {
    const cors = requestOrigin ? corsHeaders(requestOrigin) : {};
    const nonce = new URL(request.url).searchParams.get("nonce");
    const claim = nonce ? await config.authClaimStore.take(nonce) : undefined;
    if (!claim) {
      return jsonError(404, "NotReady", "No claim for this nonce yet", cors);
    }
    return json(claim, 200, cors);
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
  const claims =
    config.sessionMode === "cookie"
      ? request.method === "POST" && requestOrigin === null
        ? null
        : await authenticateCookie(request, requestOrigin, config)
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
      return json(
        { ok: true },
        200,
        config.sessionMode === "cookie"
          ? { ...cors, "set-cookie": clearSessionCookie(config) }
          : cors,
      );
    }

    case "POST /api/reply": {
      if (!(await config.replyRateLimiter(claims.did))) {
        return jsonError(
          429,
          "RateLimited",
          "Too many replies — try again in a few minutes",
          { ...cors, "retry-after": "600" },
        );
      }
      let reply;
      try {
        reply = validateReplyRequest(await request.json().catch(() => null));
      } catch (error) {
        const message =
          error instanceof ReplyValidationError
            ? error.message
            : "Invalid request body";
        return jsonError(400, "InvalidRequest", message, cors);
      }
      return postReply(claims.did, reply, clientPromise, cors);
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
    return jsonError(
      response.status === 429 ? 429 : 502,
      "PdsError",
      body.message ?? `PDS rejected the post (HTTP ${response.status})`,
      cors,
    );
  }

  const created = (await response.json()) as { uri: string; cid: string };
  return json({ uri: created.uri, cid: created.cid }, 200, cors);
};
