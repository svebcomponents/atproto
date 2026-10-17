import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importPKCS8,
  SignJWT,
  type JWK,
} from "jose";

/**
 * Short-lived identity tokens: proof, for another service, of which account
 * a bridge session belongs to. An ES256 JWT with the session's DID as `sub`
 * and the requesting service as `aud`, signed with a key only the bridge
 * holds. Services verify it offline against `/identity/jwks.json`.
 *
 * It carries no ATProto permissions and is never an ATProto credential.
 */
export interface IdentityIssuer {
  readonly audiences: readonly string[];
  jwks(): Promise<{ keys: JWK[] }>;
  mint(
    did: string,
    audience: string,
  ): Promise<{ token: string; expiresAt: number }>;
}

export const createIdentityIssuer = ({
  issuer,
  audiences,
  privateKey,
  ttlSeconds,
}: {
  /** the bridge's public base URL, the tokens' `iss` */
  issuer: string;
  audiences: readonly string[];
  /** PKCS#8 PEM ES256 key; when absent an ephemeral key is generated */
  privateKey?: string | undefined;
  ttlSeconds: number;
}): IdentityIssuer => {
  const keys = (async () => {
    const signing = privateKey
      ? await importPKCS8(privateKey, "ES256", { extractable: true })
      : (await generateKeyPair("ES256", { extractable: true })).privateKey;
    const { kty, crv, x, y } = await exportJWK(signing);
    if (!kty || !crv || !x || !y)
      throw new Error("identity key is not an EC key");
    const publicJwk: JWK = { kty, crv, x, y };
    const kid = await calculateJwkThumbprint(publicJwk);
    return {
      signing,
      kid,
      publicJwk: { ...publicJwk, kid, alg: "ES256", use: "sig" },
    };
  })();

  return {
    audiences,
    async jwks() {
      return { keys: [(await keys).publicJwk] };
    },
    async mint(did, audience) {
      const { signing, kid } = await keys;
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
        .setIssuer(issuer)
        .setSubject(did)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expiresAt)
        .sign(signing);
      return { token, expiresAt };
    },
  };
};
