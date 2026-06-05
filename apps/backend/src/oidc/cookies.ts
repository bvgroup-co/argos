import type { CookieOptions } from "express";

import config from "@/config";

const OIDC_COOKIE_MAX_AGE = 10 * 60 * 1000;

function getOidcCookieDomain() {
  const domain = config.get("session.domain");
  return domain || undefined;
}

export function getOidcCookieOptions(): CookieOptions {
  return {
    domain: getOidcCookieDomain(),
    httpOnly: true,
    sameSite: "lax",
    secure: config.get("server.secure"),
    maxAge: OIDC_COOKIE_MAX_AGE,
  };
}

export function getOidcClearCookieOptions(): CookieOptions {
  return {
    domain: getOidcCookieDomain(),
    httpOnly: true,
    sameSite: "lax",
    secure: config.get("server.secure"),
  };
}
