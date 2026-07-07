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

const html = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
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

interface AuthorizeState {
  origin: string;
  nonce: string;
}

export interface CreateServiceOptions {
  /** test seam: bypasses NodeOAuthClient construction */
  oauthClient?: OAuthBridgeClient;
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
        return handleApi(request, route, config, tokens, clientPromise);
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
  const startUrl = `${config.basePath}/oauth/start`;

  if (!handle) {
    return html(
      signInPage({
        clientName: config.clientName,
        actionUrl: startUrl,
        origin,
      }),
    );
  }

  try {
    const state: AuthorizeState = { origin, nonce: crypto.randomUUID() };
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
  try {
    const client = await clientPromise;
    const { session, state } = await client.callback(url.searchParams);
    did = session.did;
    const parsedState = JSON.parse(state ?? "") as Partial<AuthorizeState>;
    const parsedOrigin = parseOrigin(parsedState.origin ?? null);
    if (!parsedOrigin) throw new Error("state is missing the origin");
    origin = parsedOrigin;
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
  const token = await tokens.mint({ did, origin, sid });

  return html(
    callbackPage({
      origin,
      payload: { token, did, ...profile },
    }),
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
  vary: "origin",
});

const handleApi = async (
  request: Request,
  route: string,
  config: ResolvedServiceConfig,
  tokens: SessionTokenIssuer,
  clientPromise: Promise<OAuthBridgeClient>,
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

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  const claims = bearer ? await tokens.verify(bearer, requestOrigin) : null;
  if (!claims) {
    return jsonError(
      401,
      "InvalidSession",
      "Missing, expired, or origin-mismatched session token",
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
      const token = await tokens.mint(claims);
      return json({ token }, 200, cors);
    }

    case "POST /api/session/logout": {
      await config.serviceSessionStore.del(claims.sid);
      return json({ ok: true }, 200, cors);
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
      "Your Bluesky authorization expired — sign in again",
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
