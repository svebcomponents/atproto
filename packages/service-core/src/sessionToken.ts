import { SignJWT, jwtVerify } from "jose";

import type { ServiceSessionStore } from "./config.js";

const encoder = new TextEncoder();

export interface SessionTokenClaims {
  /** the signed-in user's DID */
  did: string;
  /** web origin the token is bound to */
  origin: string;
  /** service session id — revocation checks liveness in the store */
  sid: string;
}

export interface SessionTokenIssuer {
  mint(claims: SessionTokenClaims): Promise<string>;
  /**
   * Verifies signature, expiry, audience, and session liveness. When
   * `requestOrigin` is a string it must match the origin the token was
   * minted for.
   *
   * `null` means the request carried no `Origin` header, which a browser
   * only does same-origin — so it is accepted only when the token was minted
   * for the service's own origin. Callers must NOT read this as "a token
   * exfiltrated from one site is useless on another": any non-browser client
   * can omit the header at will, so origin binding constrains browsers only.
   * Requests that write to the user's repo are gated on a present origin
   * before they reach here.
   */
  verify(
    token: string,
    requestOrigin: string | null,
  ): Promise<SessionTokenClaims | null>;
}

export const createSessionTokenIssuer = ({
  secret,
  audience,
  ttlSeconds,
  serviceSessionStore,
}: {
  secret: string;
  /** the service's own public origin — also the JWT audience */
  audience: string;
  ttlSeconds: number;
  serviceSessionStore: ServiceSessionStore;
}): SessionTokenIssuer => {
  const key = encoder.encode(secret);

  return {
    async mint({ did, origin, sid }) {
      return new SignJWT({ origin, sid })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(did)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
        .sign(key);
    },

    async verify(token, requestOrigin) {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, key, { audience }));
      } catch {
        return null;
      }
      const { sub, origin, sid } = payload as {
        sub?: string;
        origin?: unknown;
        sid?: unknown;
      };
      if (!sub || typeof origin !== "string" || typeof sid !== "string") {
        return null;
      }
      // No Origin header: only a same-origin browser request omits one, so
      // accept it only for a token minted for the service's own origin.
      if (
        requestOrigin === null ? origin !== audience : requestOrigin !== origin
      ) {
        return null;
      }
      const session = await serviceSessionStore.get(sid);
      if (!session || session.did !== sub || session.origin !== origin) {
        return null;
      }
      return { did: sub, origin, sid };
    },
  };
};
