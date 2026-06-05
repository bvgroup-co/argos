import { describe, expect, it } from "vitest";

import { getOidcUserProfile } from "./auth";

describe("getOidcUserProfile", () => {
  it("reads email, profile, and group claims", () => {
    expect(
      getOidcUserProfile({
        claims: {
          iss: "https://idp.example.com",
          sub: "user-1",
          email: "USER@example.COM",
          email_verified: true,
          name: "User One",
          preferred_username: "user-one",
          groups: ["argos-users", "argos-admins", 123],
        },
        groupsClaim: "groups",
        requireVerifiedEmail: true,
      }),
    ).toEqual({
      issuer: "https://idp.example.com",
      subject: "user-1",
      email: "user@example.com",
      emailVerified: true,
      name: "User One",
      preferredUsername: "user-one",
      groups: ["argos-users", "argos-admins"],
    });
  });

  it("rejects unverified email when required", () => {
    expect(() =>
      getOidcUserProfile({
        claims: {
          iss: "https://idp.example.com",
          sub: "user-1",
          email: "user@example.com",
          email_verified: false,
        },
        groupsClaim: "groups",
        requireVerifiedEmail: true,
      }),
    ).toThrow("OIDC email is not verified");
  });
});
