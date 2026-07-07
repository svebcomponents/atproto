import { JoseKey } from "@atproto/jwk-jose";
import { NodeOAuthClient } from "@atproto/oauth-client-node";

import type { ResolvedServiceConfig } from "./config.js";

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
}

/** the subset of OAuthSession the reply handler needs */
export interface OAuthPdsSession {
  did: string;
  /** DPoP-signed fetch against the user's PDS */
  fetchHandler(pathname: string, init?: RequestInit): Promise<Response>;
}

export const buildOAuthClient = async (
  config: ResolvedServiceConfig,
): Promise<OAuthBridgeClient> => {
  const redirectUri = `${config.publicUrl}${config.basePath}/oauth/callback`;

  if (config.isLoopback) {
    // atproto's development mode: a loopback client_id carries its metadata
    // in query params and requires no hosted metadata document or keys
    const clientId = `http://localhost?${new URLSearchParams({
      scope: config.scope,
      redirect_uri: redirectUri,
    }).toString()}`;
    return new NodeOAuthClient({
      clientMetadata: {
        client_id: clientId,
        client_name: config.clientName,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: config.scope,
        application_type: "native",
        token_endpoint_auth_method: "none",
        dpop_bound_access_tokens: true,
      },
      stateStore: config.stateStore,
      sessionStore: config.sessionStore,
    }) as unknown as OAuthBridgeClient;
  }

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
      client_id: `${config.publicUrl}${config.basePath}/client-metadata.json`,
      client_name: config.clientName,
      client_uri: config.publicUrl,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: config.scope,
      application_type: "web",
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_signing_alg: "ES256",
      dpop_bound_access_tokens: true,
      jwks_uri: `${config.publicUrl}${config.basePath}/jwks.json`,
    },
    keyset,
    stateStore: config.stateStore,
    sessionStore: config.sessionStore,
  }) as unknown as OAuthBridgeClient;
};
