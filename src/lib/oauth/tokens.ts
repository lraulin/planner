import { createHmac, timingSafeEqual } from "node:crypto";
import { oauthSigningSecret } from "./origin";

const PREFIX = "p1";

export type AccessTokenClaims = {
  typ: "at";
  sub: string;
  aud: string;
  exp: number;
  iat: number;
};

export type RefreshTokenClaims = {
  typ: "rt";
  sub: string;
  aud: string;
  exp: number;
  iat: number;
};

export type AuthCodeClaims = {
  typ: "code";
  sub: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  method: "S256";
  resource: string;
  exp: number;
  iat: number;
};

export type ClientRegistrationClaims = {
  typ: "client";
  clientName: string;
  redirectUris: string[];
  iat: number;
};

export type SignedClaims =
  AccessTokenClaims | RefreshTokenClaims | AuthCodeClaims | ClientRegistrationClaims;

function b64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signClaims(
  claims: SignedClaims,
  secret = oauthSigningSecret(),
): string {
  const payload = b64url(JSON.stringify(claims));
  return `${PREFIX}.${payload}.${hmac(payload, secret)}`;
}

export function verifyClaims<T extends SignedClaims["typ"]>(
  token: string,
  expectedTyp: T,
  secret = oauthSigningSecret(),
): Extract<SignedClaims, { typ: T }> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, payload, sig] = parts;
  const expected = hmac(payload, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Extract<SignedClaims, { typ: T }>;
    if (claims.typ !== expectedTyp) return null;
    if (
      "exp" in claims &&
      typeof claims.exp === "number" &&
      claims.exp < Date.now() / 1000
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

export const ACCESS_TTL_SEC = 60 * 60;
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 30;
export const CODE_TTL_SEC = 5 * 60;

export function issueAccessToken(sub: string, aud: string, now = Date.now()): string {
  return signClaims({
    typ: "at",
    sub,
    aud,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ACCESS_TTL_SEC,
  });
}

export function issueRefreshToken(sub: string, aud: string, now = Date.now()): string {
  return signClaims({
    typ: "rt",
    sub,
    aud,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + REFRESH_TTL_SEC,
  });
}

export function issueAuthCode(
  claims: Omit<AuthCodeClaims, "typ" | "iat" | "exp">,
  now = Date.now(),
): string {
  return signClaims({
    ...claims,
    typ: "code",
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + CODE_TTL_SEC,
  });
}
