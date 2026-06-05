import { describe, expect, it } from "vitest";

import {
  getAuthProviderOptions,
  getOidcLoginLabel,
  getSignupProviderOptions,
} from "./auth-provider-options";

describe("getAuthProviderOptions", () => {
  it("only returns OIDC in OIDC login mode", () => {
    expect(
      getAuthProviderOptions({
        auth: { loginMode: "oidc" },
        oidc: { enabled: true, displayName: "Keycloak" },
      }),
    ).toEqual(["oidc"]);
  });

  it("keeps default providers in default login mode", () => {
    expect(
      getAuthProviderOptions({
        auth: { loginMode: "default" },
        oidc: { enabled: true, displayName: "SSO" },
      }),
    ).toEqual(["google", "oidc", "github", "gitlab", "saml"]);
  });
});

describe("getSignupProviderOptions", () => {
  it("only returns OIDC in OIDC login mode", () => {
    expect(
      getSignupProviderOptions({
        auth: { loginMode: "oidc" },
        oidc: { enabled: true, displayName: "Keycloak" },
      }),
    ).toEqual(["oidc"]);
  });
});

describe("getOidcLoginLabel", () => {
  it("uses the configured OIDC display name", () => {
    expect(
      getOidcLoginLabel({ oidc: { enabled: true, displayName: "Keycloak" } }),
    ).toBe("Continue with Keycloak");
  });
});
