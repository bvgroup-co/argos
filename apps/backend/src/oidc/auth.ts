import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";

import { sanitizeEmail } from "@/util/email";
import { boom } from "@/util/error";

const DiscoverySchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
});

const TokenResponseSchema = z.object({
  id_token: z.string(),
  access_token: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});

export type OidcUserProfile = {
  issuer: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  preferredUsername: string | null;
  groups: string[];
};

export type OidcDiscovery = z.infer<typeof DiscoverySchema>;

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export function createOidcNonce() {
  return base64Url(randomBytes(32));
}

export function createOidcCodeVerifier() {
  return base64Url(randomBytes(64));
}

export function hashOidcCookieValue(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function createCodeChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export async function discoverOidcProvider(issuerUrl: string) {
  const url = new URL(".well-known/openid-configuration", `${issuerUrl}/`);
  const response = await fetch(url);
  if (!response.ok) {
    throw boom(502, "Unable to discover OIDC provider metadata");
  }
  const discovery = DiscoverySchema.parse(await response.json());
  if (discovery.issuer !== issuerUrl) {
    throw boom(502, "OIDC issuer metadata does not match configuration");
  }
  return discovery;
}

export function getOidcAuthUrl(input: {
  discovery: OidcDiscovery;
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}) {
  const url = new URL(input.discovery.authorization_endpoint);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes);
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set(
    "code_challenge",
    createCodeChallenge(input.codeVerifier),
  );
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeOidcCode(input: {
  discovery: OidcDiscovery;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", input.clientId);
  body.set("client_secret", input.clientSecret);
  body.set("redirect_uri", input.redirectUri);
  body.set("code", input.code);
  body.set("code_verifier", input.codeVerifier);

  const response = await fetch(input.discovery.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });
  if (!response.ok) {
    throw boom(401, "OIDC token exchange failed");
  }
  return TokenResponseSchema.parse(await response.json());
}

export async function verifyOidcIdToken(input: {
  discovery: OidcDiscovery;
  clientId: string;
  idToken: string;
  nonce: string;
}) {
  const jwks = createRemoteJWKSet(new URL(input.discovery.jwks_uri));
  const result = await jwtVerify(input.idToken, jwks, {
    issuer: input.discovery.issuer,
    audience: input.clientId,
  });
  if (result.payload["nonce"] !== input.nonce) {
    throw boom(401, "Invalid OIDC nonce");
  }
  return result.payload;
}

export function getOidcUserProfile(input: {
  claims: JWTPayload;
  groupsClaim: string;
  requireVerifiedEmail: boolean;
}): OidcUserProfile {
  const { claims } = input;
  if (!claims.iss) {
    throw boom(401, "OIDC token is missing issuer");
  }
  if (!claims.sub) {
    throw boom(401, "OIDC token is missing subject");
  }
  if (typeof claims["email"] !== "string") {
    throw boom(400, "OIDC token is missing email");
  }
  const emailVerified = claims["email_verified"] === true;
  if (input.requireVerifiedEmail && !emailVerified) {
    throw boom(400, "OIDC email is not verified");
  }
  const rawGroups = claims[input.groupsClaim];
  const groups = Array.isArray(rawGroups)
    ? rawGroups.filter((group): group is string => typeof group === "string")
    : [];
  return {
    issuer: claims.iss,
    subject: claims.sub,
    email: sanitizeEmail(claims["email"]),
    emailVerified,
    name: typeof claims["name"] === "string" ? claims["name"] : null,
    preferredUsername:
      typeof claims["preferred_username"] === "string"
        ? claims["preferred_username"]
        : null,
    groups,
  };
}
