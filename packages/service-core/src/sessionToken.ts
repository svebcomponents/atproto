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
   * `requestOrigin` is provided (browser requests send an Origin header) it
   * must match the origin the token was minted for — a token exfiltrated
   * from one site is useless on another.
   */
  verify(
    token: string,
    requestOrigin?: string | null,
  ): Promise<SessionTokenClaims | null>;
}

export const createSessionTokenIssuer = ({
  secret,
  audience,
  ttlSeconds,
  serviceSessionStore,
}: {
  secret: string;
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
      if (requestOrigin != null && requestOrigin !== origin) {
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
