import type { JWTPayload } from "jose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import config from "@/config";
import type { Account, OidcIdentity } from "@/database/models";
import * as accountService from "@/database/services/account";
import * as oidcIdentityService from "@/database/services/oidcIdentity";
import * as oidc from "@/oidc";
import { createTestApp } from "@/web/test-util";

import router from "./auth";

vi.mock("@/database/services/account", async () => {
  const actual = await vi.importActual<
    typeof import("@/database/services/account")
  >("@/database/services/account");
  return {
    ...actual,
    createJWTFromAccount: vi.fn(() => "jwt"),
    getOrCreateUserAccountFromOidcIdentity: vi.fn(),
    markUserLastAuthMethod: vi.fn(),
    syncOidcTeamMemberships: vi.fn(),
  };
});

vi.mock("@/database/services/oidcIdentity", () => ({
  getOrCreateOidcIdentity: vi.fn(),
}));

vi.mock("@/oidc", async () => {
  const actual = await vi.importActual<typeof import("@/oidc")>("@/oidc");
  return {
    ...actual,
    discoverOidcProvider: vi.fn(),
    exchangeOidcCode: vi.fn(),
    getOidcUserProfile: vi.fn(),
    parseOidcGroupTeamMappings: vi.fn(),
    verifyOidcIdToken: vi.fn(),
  };
});

const app = createTestApp(router);

const mockAccount = {
  id: "account-1",
  userId: "user-1",
  slug: "user-1",
  name: "User One",
} as Account;

const mockProfile = {
  issuer: "https://idp.example.com",
  subject: "subject-1",
  email: "user@example.com",
  emailVerified: true,
  name: "User One",
  preferredUsername: "user-one",
  groups: ["argos-users"],
};

const originalOidcEnabled = config.get("oidc.enabled");

beforeEach(() => {
  config.set("oidc.enabled", true);
  vi.mocked(oidc.discoverOidcProvider).mockResolvedValue({
    issuer: "https://idp.example.com",
    authorization_endpoint: "https://idp.example.com/auth",
    token_endpoint: "https://idp.example.com/token",
    jwks_uri: "https://idp.example.com/jwks",
  });
  vi.mocked(oidc.exchangeOidcCode).mockResolvedValue({
    id_token: "id-token",
  });
  vi.mocked(oidc.verifyOidcIdToken).mockResolvedValue({} as JWTPayload);
  vi.mocked(oidc.getOidcUserProfile).mockReturnValue(mockProfile);
  vi.mocked(oidc.parseOidcGroupTeamMappings).mockReturnValue([
    { group: "argos-users", teamSlug: "team", role: "member" },
  ]);
  vi.mocked(oidcIdentityService.getOrCreateOidcIdentity).mockResolvedValue({
    id: "oidc-identity-1",
  } as OidcIdentity);
  vi.mocked(
    accountService.getOrCreateUserAccountFromOidcIdentity,
  ).mockResolvedValue({
    account: mockAccount,
    creation: false,
  });
});

afterEach(() => {
  config.set("oidc.enabled", originalOidcEnabled);
  vi.clearAllMocks();
});

describe("OIDC API auth", () => {
  it("does not globally mark team memberships as OIDC", async () => {
    await request(app)
      .post("/auth/oidc")
      .set(
        "Cookie",
        [
          `oidc_state=${oidc.hashOidcCookieValue("state-1")}`,
          "oidc_nonce=nonce-1",
          "oidc_code_verifier=verifier-1",
        ].join("; "),
      )
      .send({ code: "code-1", state: "state-1" })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({
          jwt: "jwt",
          creation: false,
          hasAutoInvite: false,
        });
      });

    expect(accountService.markUserLastAuthMethod).not.toHaveBeenCalled();
    expect(accountService.syncOidcTeamMemberships).toHaveBeenCalledWith({
      userId: "user-1",
      subject: "subject-1",
      groups: ["argos-users"],
      mappings: [{ group: "argos-users", teamSlug: "team", role: "member" }],
    });
  });
});
