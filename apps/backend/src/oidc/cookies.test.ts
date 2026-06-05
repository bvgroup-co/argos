import { afterEach, describe, expect, it } from "vitest";

import config from "@/config";

import { getOidcClearCookieOptions, getOidcCookieOptions } from "./cookies";

describe("OIDC cookie options", () => {
  const originalSessionDomain = config.get("session.domain");
  const originalServerSecure = config.get("server.secure");

  afterEach(() => {
    config.set("session.domain", originalSessionDomain);
    config.set("server.secure", originalServerSecure);
  });

  it("scopes login cookies to the configured session domain", () => {
    config.set("session.domain", ".example.com");
    config.set("server.secure", true);

    expect(getOidcCookieOptions()).toEqual({
      domain: ".example.com",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 10 * 60 * 1000,
    });
    expect(getOidcClearCookieOptions()).toEqual({
      domain: ".example.com",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  });
});
