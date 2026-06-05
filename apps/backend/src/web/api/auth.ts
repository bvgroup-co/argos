import { invariant } from "@argos/util/invariant";
import axios from "axios";
import express, { Router } from "express";
import { z } from "zod";

import { safeJwtAuthFromExpressReq } from "@/auth/jwt";
import type { AuthJWTPayload } from "@/auth/payload";
import { consumeSamlAuthCode } from "@/auth/saml";
import config from "@/config";
import type { Account } from "@/database/models";
import { Account as AccountModel } from "@/database/models";
import {
  createJWTFromAccount,
  getOrCreateUserAccountFromGhAccount,
  getOrCreateUserAccountFromGitlabUser,
  getOrCreateUserAccountFromGoogleUser,
  getOrCreateUserAccountFromOidcIdentity,
  joinSSOTeams,
  markUserLastAuthMethod,
  syncOidcTeamMemberships,
} from "@/database/services/account";
import { getOrCreateGhAccountFromGhProfile } from "@/database/services/github";
import { getOrCreateGitlabUser } from "@/database/services/gitlabUser";
import { getOrCreateGoogleUser } from "@/database/services/googleUser";
import { getOrCreateOidcIdentity } from "@/database/services/oidcIdentity";
import { hasAutoInviteForUser } from "@/database/services/team-domain";
import {
  getTokenOctokit,
  retrieveOAuthToken as retrieveGithubOAuthToken,
} from "@/github";
import {
  getGitlabClient,
  retrieveOAuthToken as retrieveGitlabOAuthToken,
} from "@/gitlab";
import { getGoogleAuthenticatedClient, getGoogleUserProfile } from "@/google";
import {
  discoverOidcProvider,
  exchangeOidcCode,
  getOidcClearCookieOptions,
  getOidcUserProfile,
  hashOidcCookieValue,
  parseOidcGroupTeamMappings,
  verifyOidcIdToken,
} from "@/oidc";
import { boom } from "@/util/error";

import { allowApp } from "../middlewares/cors";
import { allowOnlyPost } from "../middlewares/methods";
import { asyncHandler } from "../util";

const router: Router = Router();

export default router;

const OAuthBodySchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});
const SamlBodySchema = z.object({
  code: z.string(),
});

type OAuthBody = z.infer<typeof OAuthBodySchema>;
type OAuthResult = {
  account: Account;
  creation: boolean;
};

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (trimmed.slice(0, eq) === name) {
      return decodeURIComponent(trimmed.slice(eq + 1)) || null;
    }
  }
  return null;
}

/**
 * Create an OAuth handler.
 */
function withOAuth(
  retrieveAccount: (
    body: OAuthBody,
    auth: AuthJWTPayload | null,
    req: express.Request,
    res: express.Response,
  ) => Promise<OAuthResult>,
): express.RequestHandler[] {
  return [
    allowApp,
    allowOnlyPost,
    express.json(),
    asyncHandler(async (req, res) => {
      const auth = await safeJwtAuthFromExpressReq(req);
      try {
        const parsed = OAuthBodySchema.parse(req.body);
        const { account, creation } = await retrieveAccount(
          parsed,
          auth ?? null,
          req,
          res,
        );
        invariant(account.userId, "Expected account to have userId");
        const hasAutoInvite =
          !auth && creation
            ? await hasAutoInviteForUser({ userId: account.userId })
            : false;
        res.send({
          jwt: createJWTFromAccount(account),
          creation,
          hasAutoInvite,
        });
      } catch (error) {
        if (error instanceof axios.AxiosError && error.response) {
          res.status(error.response.status);
          return;
        }
        throw error;
      }
    }),
  ];
}

router.use(
  "/auth/github",
  withOAuth(async (body, auth) => {
    const result = await retrieveGithubOAuthToken({
      clientId: config.get("github.clientId"),
      clientSecret: config.get("github.clientSecret"),
      code: body.code,
      redirectUri: `${config.get("server.url")}/auth/github/callback`,
    });

    const octokit = getTokenOctokit({
      token: result.access_token,
      proxy: false,
    });
    const [profile, emails] = await Promise.all([
      octokit.users.getAuthenticated(),
      octokit.users.listEmailsForAuthenticatedUser(),
    ]);
    const ghAccount = await getOrCreateGhAccountFromGhProfile(
      profile.data,
      emails.data,
      {
        accessToken: result.access_token,
        lastLoggedAt: new Date().toISOString(),
        scope: result.scope,
      },
    );
    const { account, creation } = await getOrCreateUserAccountFromGhAccount({
      ghAccount,
      attachToAccount: auth?.account ?? null,
    });
    invariant(account.userId, "Expected account to have userId");
    await joinSSOTeams({
      githubAccountId: ghAccount.id,
      userId: account.userId,
    });
    if (!auth) {
      await markUserLastAuthMethod({
        userId: account.userId,
        method: "github",
      });
    }
    return { account, creation };
  }),
);

router.use(
  "/auth/gitlab",
  withOAuth(async (body, auth) => {
    const response = await retrieveGitlabOAuthToken({
      clientId: config.get("gitlab.appId"),
      clientSecret: config.get("gitlab.appSecret"),
      code: body.code,
      redirectUri: `${config.get("server.url")}/auth/gitlab/callback`,
    });

    const api = getGitlabClient({ accessToken: response.access_token });
    const apiUser = await api.Users.showCurrentUser();
    const gitlabUser = await getOrCreateGitlabUser(apiUser, {
      accessToken: response.access_token,
      accessTokenExpiresAt: new Date(Date.now() + response.expires_in * 1000),
      refreshToken: response.refresh_token,
      lastLoggedAt: new Date().toISOString(),
    });
    const { account, creation } = await getOrCreateUserAccountFromGitlabUser({
      gitlabUser,
      attachToAccount: auth?.account ?? null,
    });
    invariant(account.userId, "Expected account to have userId");
    if (!auth) {
      await markUserLastAuthMethod({
        userId: account.userId,
        method: "gitlab",
      });
    }
    return { account, creation };
  }),
);

router.use(
  "/auth/google",
  withOAuth(async (body, auth) => {
    const client = await getGoogleAuthenticatedClient({
      code: body.code,
      clientId: config.get("google.clientId"),
      clientSecret: config.get("google.clientSecret"),
      redirectUri: `${config.get("server.url")}/auth/google/callback`,
    });
    const profile = await getGoogleUserProfile({ client });
    const googleUser = await getOrCreateGoogleUser(profile, {
      lastLoggedAt: new Date().toISOString(),
    });
    const { account, creation } = await getOrCreateUserAccountFromGoogleUser({
      googleUser,
      attachToAccount: auth?.account ?? null,
    });
    invariant(account.userId, "Expected account to have userId");
    if (!auth) {
      await markUserLastAuthMethod({
        userId: account.userId,
        method: "google",
      });
    }
    return { account, creation };
  }),
);

router.use(
  "/auth/oidc",
  withOAuth(async (body, auth, req, res) => {
    if (!config.get("oidc.enabled")) {
      throw boom(404, "OIDC authentication is disabled");
    }
    const state = body.state;
    if (!state) {
      throw boom(401, "Missing OIDC state");
    }
    const stateHash = readCookie(req.headers.cookie, "oidc_state");
    const nonce = readCookie(req.headers.cookie, "oidc_nonce");
    const codeVerifier = readCookie(req.headers.cookie, "oidc_code_verifier");
    if (!stateHash || !nonce || !codeVerifier) {
      throw boom(401, "Missing OIDC login session");
    }
    if (stateHash !== hashOidcCookieValue(state)) {
      throw boom(401, "Invalid OIDC state");
    }
    const cookieOptions = getOidcClearCookieOptions();
    res.clearCookie("oidc_state", cookieOptions);
    res.clearCookie("oidc_nonce", cookieOptions);
    res.clearCookie("oidc_code_verifier", cookieOptions);
    const discovery = await discoverOidcProvider(config.get("oidc.issuerUrl"));
    const tokenResponse = await exchangeOidcCode({
      discovery,
      clientId: config.get("oidc.clientId"),
      clientSecret: config.get("oidc.clientSecret"),
      redirectUri: `${config.get("server.url")}/auth/oidc/callback`,
      code: body.code,
      codeVerifier,
    });
    const claims = await verifyOidcIdToken({
      discovery,
      clientId: config.get("oidc.clientId"),
      idToken: tokenResponse.id_token,
      nonce,
    });
    const profile = getOidcUserProfile({
      claims,
      groupsClaim: config.get("oidc.groupsClaim"),
      requireVerifiedEmail: config.get("oidc.requireVerifiedEmail"),
    });
    const oidcIdentity = await getOrCreateOidcIdentity(profile, {
      lastLoggedAt: new Date().toISOString(),
    });
    const { account, creation } = await getOrCreateUserAccountFromOidcIdentity({
      oidcIdentity,
      attachToAccount: auth?.account ?? null,
    });
    invariant(account.userId, "Expected account to have userId");
    await syncOidcTeamMemberships({
      userId: account.userId,
      subject: profile.subject,
      groups: profile.groups,
      mappings: parseOidcGroupTeamMappings(
        config.get("oidc.groupTeamMappings"),
      ),
    });
    if (!auth) {
      await markUserLastAuthMethod({
        userId: account.userId,
        method: "oidc",
      });
    }
    return { account, creation };
  }),
);

router.use(
  "/auth/saml",
  allowApp,
  allowOnlyPost,
  express.json(),
  asyncHandler(async (req, res) => {
    const parsed = SamlBodySchema.parse(req.body);
    const payload = await consumeSamlAuthCode(parsed.code);
    if (!payload) {
      res.status(401).send({
        error: {
          message: "Invalid or expired SAML auth code.",
        },
      });
      return;
    }
    const account = await AccountModel.query()
      .findById(payload.accountId)
      .throwIfNotFound();
    res.send({
      jwt: createJWTFromAccount(account),
      redirect: payload.redirect,
    });
  }),
);
