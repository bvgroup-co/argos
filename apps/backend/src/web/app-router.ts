import { join } from "node:path";
import type { ClientConfig } from "@argos/config-types";
import express, { Router, static as serveStatic } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";

import config, { type Config } from "@/config";
import { getGoogleAuthUrl } from "@/google";
import { apolloServer, createApolloMiddleware } from "@/graphql";
import {
  createOidcCodeVerifier,
  createOidcNonce,
  discoverOidcProvider,
  getOidcAuthUrl,
  getOidcCookieOptions,
  hashOidcCookieValue,
} from "@/oidc";
import { getSlackMiddleware } from "@/slack";
import { boom } from "@/util/error";
import { createRedisStore } from "@/util/rate-limit";

import { getEmailPreviewMiddleware } from "../email/express";
import { getNotificationPreviewMiddleware } from "../notification/express";
import samlAuthRouter from "./auth-saml";
import deploymentAccessRouter from "./deployment-access";
import { asyncHandler, subdomain } from "./util";

export function createClientConfig(appConfig: Config): ClientConfig {
  return {
    samlTeamSlug: appConfig.get("samlTeamSlug"),
    sentry: {
      environment: appConfig.get("sentry.environment"),
      clientDsn: appConfig.get("sentry.clientDsn"),
    },
    session: {
      domain: appConfig.get("session.domain"),
    },
    email: {
      enabled: appConfig.get("resend.enabled"),
    },
    auth: {
      loginMode: appConfig.get("auth.loginMode") as "default" | "oidc",
    },
    oidc: {
      enabled: appConfig.get("oidc.enabled"),
      displayName: appConfig.get("oidc.displayName"),
    },
    releaseVersion: appConfig.get("releaseVersion"),
    contactEmail: appConfig.get("contactEmail"),
    github: {
      appUrl: appConfig.get("github.appUrl"),
      clientId: appConfig.get("github.clientId"),
      loginUrl: appConfig.get("github.loginUrl"),
      marketplaceUrl: appConfig.get("github.marketplaceUrl"),
    },
    githubLight: {
      appUrl: appConfig.get("githubLight.appUrl"),
    },
    gitlab: {
      loginUrl: appConfig.get("gitlab.loginUrl"),
    },
    stripe: {
      pricingTableId: appConfig.get("stripe.pricingTableId"),
      publishableKey: appConfig.get("stripe.publishableKey"),
    },
    server: {
      url: appConfig.get("server.url"),
    },
    api: {
      baseUrl: appConfig.get("api.baseUrl"),
    },
    deployments: {
      baseDomain: appConfig.get("deployments.baseDomain"),
    },
    bucket: {
      publishableKey: appConfig.get("bucket.publishableKey"),
    },
  };
}

export const installAppRouter = async (app: express.Application) => {
  const router = Router();

  const limiter = rateLimit({
    windowMs: config.get("app.rateLimit.window"),
    limit: config.get("app.rateLimit.limit"),
    standardHeaders: false,
    legacyHeaders: false,
    store: createRedisStore("app"),
  });

  router.use(limiter);

  const clientConfig = createClientConfig(config);

  router.get("/config.js", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=0");
    res.setHeader("Content-Type", "application/javascript");
    res.send(`window.clientData = ${JSON.stringify({ config: clientConfig })}`);
  });

  const distDir = join(import.meta.dirname, "../../../frontend/dist");

  if (config.get("env") !== "production") {
    router.use(
      "/notification-preview",
      getNotificationPreviewMiddleware({ path: "/notification-preview" }),
    );
    router.use(
      "/email-preview",
      getEmailPreviewMiddleware({ path: "/email-preview" }),
    );
  }

  await apolloServer.start();

  const cspReportUri = getCSPReportURI();

  if (cspReportUri) {
    router.use((_req, res, next) => {
      res.setHeader(
        "Report-To",
        JSON.stringify({
          group: "csp-endpoint",
          max_age: 10886400,
          endpoints: [{ url: cspReportUri }],
        }),
      );
      next();
    });
  }

  router.use(
    "/graphql",
    // Handle cases where the request stream is not readable
    (req, _res, next) => {
      if (!req.readable) {
        console.error(
          "Request stream is not readable. Possible reasons: client closed connection, malformed request, or stream already consumed.",
        );
        throw boom(
          400,
          "Request could not be processed. Please check your connection or the data being sent.",
        );
      }
      next();
    },
    express.json(),
    helmet({
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
      contentSecurityPolicy: {
        directives: {
          "frame-ancestors": ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      frameguard: {
        action: "deny", // Disallow embedded iframe
      },
    }),
    createApolloMiddleware(),
  );

  router.get("/auth/logout", (req, res) => {
    res.setHeader("Clear-Site-Data", '"cookies", "storage", "cache"');
    const redirectTo =
      typeof req.query["r"] === "string" ? req.query["r"] : null;
    const search = redirectTo ? `?r=${encodeURIComponent(redirectTo)}` : "";
    res.redirect(`/login${search}`);
  });

  const OAuthQueryParamsSchema = z.object({
    state: z.string(),
    redirect_uri: z.string(),
  });

  router.get("/auth/google/login", (req, res) => {
    const parsed = OAuthQueryParamsSchema.safeParse(req.query);
    if (!parsed.success) {
      res.redirect("/");
      return;
    }
    const { state, redirect_uri: redirectUri } = parsed.data;
    res.redirect(
      getGoogleAuthUrl({
        clientId: config.get("google.clientId"),
        clientSecret: config.get("google.clientSecret"),
        redirectUri,
        state,
      }),
    );
  });

  router.get(
    "/auth/oidc/login",
    asyncHandler(async (req, res) => {
      if (!config.get("oidc.enabled")) {
        res.redirect("/");
        return;
      }
      const parsed = OAuthQueryParamsSchema.safeParse(req.query);
      if (!parsed.success) {
        res.redirect("/");
        return;
      }
      const { state, redirect_uri: redirectUri } = parsed.data;
      const codeVerifier = createOidcCodeVerifier();
      const nonce = createOidcNonce();
      const cookieOptions = getOidcCookieOptions();
      res.cookie("oidc_state", hashOidcCookieValue(state), cookieOptions);
      res.cookie("oidc_nonce", nonce, cookieOptions);
      res.cookie("oidc_code_verifier", codeVerifier, cookieOptions);
      const discovery = await discoverOidcProvider(
        config.get("oidc.issuerUrl"),
      );
      res.redirect(
        getOidcAuthUrl({
          discovery,
          clientId: config.get("oidc.clientId"),
          redirectUri,
          scopes: config.get("oidc.scopes"),
          state,
          nonce,
          codeVerifier,
        }),
      );
    }),
  );

  router.use(samlAuthRouter);

  router.use(deploymentAccessRouter);

  router.use(getSlackMiddleware());

  // Static directory
  router.use(
    serveStatic(distDir, {
      etag: true,
      lastModified: false,
      maxAge: "1 year",
      index: false,
    }),
  );

  router.use(
    helmet({
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "img-src": [
            "'self'",
            "data:",
            "blob:",
            "https://argos-ci.com",
            // ImageKit images
            "https://files.argos-ci.com",
            // S3 images
            `https://${config.get("s3.screenshotsBucket")}.s3.${config.get("s3.region")}.amazonaws.com`,
            // GitHub and GitLab avatars
            "https://github.com",
            "https://avatars.githubusercontent.com",
            "https://gitlab.com",
            "https://secure.gravatar.com",
          ],
          "worker-src": ["'self'", "blob:"],
          "script-src": [
            "'self'",
            // Monaco editor
            "https://cdn.jsdelivr.net",
            // Script to update color classes
            "'sha256-3eiqAvd5lbIOVQdobPBczwuRAhAf7/oxg3HH2aFmp8Y='",
            ...config.get("csp.scriptSrc"),
          ],
          "connect-src": ["'self'", "*"],
          ...(cspReportUri
            ? { "report-to": ["csp-endpoint"], "report-uri": [cspReportUri] }
            : {}),
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      frameguard: {
        action: "deny", // Disallow embedded iframe
      },
    }),
  );

  router.get("/{*splat}", (_req, res) => {
    res.sendFile(join(distDir, "index.html"));
  });

  // Express 5 {*splat} requires at least one path segment, so "/" does not
  // match the catch-all above. Add an explicit root handler so that "/"
  // serves the SPA shell (needed for single-domain deployments).
  router.get("/", (_req, res) => {
    res.sendFile(join(distDir, "index.html"));
  });

  app.use(subdomain(router, "app"));
};

function getCSPReportURI(): null | string {
  const baseURI = config.get("sentry.cspReportUri");
  if (!baseURI) {
    return null;
  }
  const url = new URL(baseURI);
  url.searchParams.set("sentry_environment", config.get("sentry.environment"));
  url.searchParams.set("sentry_release", config.get("releaseVersion"));
  return url.toString();
}
