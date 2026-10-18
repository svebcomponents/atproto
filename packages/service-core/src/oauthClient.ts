import { JoseKey } from "@atproto/jwk-jose";
import { NodeOAuthClient } from "@atproto/oauth-client-node";

import type { ResolvedPermissionSet, ResolvedServiceConfig } from "./config.js";

/**
 * The structural subset of NodeOAuthClient the handlers use — kept narrow so
 * tests can inject a fake without touching the network.
 */
export interface OAuthBridgeClient {
  clientMetadata: Record<string, unknown>;
  jwks: Record<string, unknown>;
  authorize(
    handle: string,
    options: { state: string; signal?: AbortSignal },
  ): Promise<URL>;
  callback(
    params: URLSearchParams,
  ): Promise<{ session: OAuthPdsSession; state: string | null }>;
  restore(did: string): Promise<OAuthPdsSession>;
  /**
   * Revokes the stored ATProto token set for a DID and deletes it from the
   * session store. Called on sign-out so the grant does not outlive the
   * browser session the reader thinks they ended.
   */
  revoke(did: string): Promise<void>;
}

/** the subset of OAuthSession the reply handler needs */
export interface OAuthPdsSession {
  did: string;
  /** DPoP-signed fetch against the user's PDS */
  fetchHandler(pathname: string, init?: RequestInit): Promise<Response>;
}

/**
 * Where a client's metadata and callback live: the default client at the
 * base path, each permission set's client under `/clients/<name>`.
 */
export const clientPath = (
  config: ResolvedServiceConfig,
  set?: ResolvedPermissionSet,
): string => (set ? `${config.basePath}/clients/${set.name}` : config.basePath);

/**
 * Builds the default OAuth client, or a permission set's client when `set` is
 * given. A set's client has its own `client_id`, name, scope, redirect URI,
 * and namespaced stores; it shares the default client's signing keys.
 */
export const buildOAuthClient = async (
  config: ResolvedServiceConfig,
  set?: ResolvedPermissionSet,
): Promise<OAuthBridgeClient> => {
  const path = clientPath(config, set);
  const scope = set?.scope ?? config.scope;
  const stateStore = set?.stateStore ?? config.stateStore;
  const sessionStore = set?.sessionStore ?? config.sessionStore;
  if (config.isLoopback) {
    // atproto's development mode. Rules (RFC 8252): the client_id origin is
    // always `http://localhost` with metadata carried in the query string,
    // but redirect_uris must use a loopback IP (127.0.0.1), not "localhost".
    const redirectUrl = new URL(`${path}/oauth/callback`, config.publicUrl);
    redirectUrl.hostname = "127.0.0.1";
    const redirectUri = redirectUrl.toString();

    const clientId = `http://localhost?${new URLSearchParams({
      scope,
      redirect_uri: redirectUri,
    }).toString()}`;
    return new NodeOAuthClient({
      clientMetadata: {
        client_id: clientId,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope,
        application_type: "native",
        token_endpoint_auth_method: "none",
        dpop_bound_access_tokens: true,
      },
      stateStore,
      sessionStore,
    }) as unknown as OAuthBridgeClient;
  }

  const redirectUri = `${config.publicUrl}${path}/oauth/callback`;

  if (!(config.keys && config.keys.length > 0)) {
    throw new Error(
      "keys are required for non-loopback deployments (private_key_jwt)",
    );
  }
  const keyset = await Promise.all(
    config.keys.map((key, index) =>
      JoseKey.fromImportable(key, `key-${index + 1}`),
    ),
  );

  return new NodeOAuthClient({
    clientMetadata: {
      client_id: `${config.publicUrl}${path}/client-metadata.json`,
      client_name: set?.clientName ?? config.clientName,
      client_uri: config.publicUrl,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope,
      application_type: "web",
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      dpop_bound_access_tokens: true,
      jwks_uri: `${config.publicUrl}${config.basePath}/jwks.json`,
    },
    keyset,
    stateStore,
    sessionStore,
  }) as unknown as OAuthBridgeClient;
};
