import { beforeEach, describe, expect, it, vi } from "vitest";

import { Account, TeamUser } from "@/database/models";
import { factory, setupDatabase } from "@/database/testing";

import {
  getOrCreateUserAccountFromOidcIdentity,
  syncOidcTeamMemberships,
} from "./account";
import { getOrCreateOidcIdentity } from "./oidcIdentity";

vi.mock("@/notification", () => ({
  sendNotification: vi.fn(),
}));

describe("OIDC account provisioning", () => {
  beforeEach(async () => {
    await setupDatabase();
  });

  it("creates and reuses an OIDC identity", async () => {
    const identity = await getOrCreateOidcIdentity({
      issuer: "https://idp.example.com",
      subject: "user-1",
      email: "user@example.com",
      emailVerified: true,
      name: "User One",
      preferredUsername: "user-one",
      groups: ["argos-users"],
    });

    const { account, creation } = await getOrCreateUserAccountFromOidcIdentity({
      oidcIdentity: identity,
      attachToAccount: null,
    });

    expect(creation).toBe(true);
    expect(account.userId).toBeTruthy();

    const sameIdentity = await getOrCreateOidcIdentity({
      issuer: "https://idp.example.com",
      subject: "user-1",
      email: "user@example.com",
      emailVerified: true,
      name: "User One",
      preferredUsername: "user-one",
      groups: ["argos-users"],
    });
    const secondAuth = await getOrCreateUserAccountFromOidcIdentity({
      oidcIdentity: sameIdentity,
      attachToAccount: null,
    });

    expect(secondAuth.creation).toBe(false);
    expect(secondAuth.account.id).toBe(account.id);
  });

  it("syncs mapped groups additively and keeps highest role", async () => {
    const user = await factory.User.create();
    await factory.TeamAccount.create({
      slug: "member-team",
    });
    await factory.TeamAccount.create({
      slug: "owner-team",
    });

    await syncOidcTeamMemberships({
      userId: user.id,
      subject: "user-1",
      groups: ["argos-users", "argos-admins"],
      mappings: [
        { group: "argos-users", teamSlug: "member-team", role: "member" },
        { group: "argos-users", teamSlug: "owner-team", role: "member" },
        { group: "argos-admins", teamSlug: "owner-team", role: "owner" },
      ],
    });

    const memberships = await TeamUser.query()
      .where("userId", user.id)
      .orderBy("teamId");
    const accounts = await Account.query().whereIn(
      "teamId",
      memberships.map((membership) => membership.teamId),
    );
    const levelBySlug = new Map(
      memberships.map((membership) => {
        const account = accounts.find(
          (account) => account.teamId === membership.teamId,
        );
        return [account?.slug, membership.userLevel];
      }),
    );

    expect(levelBySlug.get("member-team")).toBe("member");
    expect(levelBySlug.get("owner-team")).toBe("owner");
  });

  it("does not overwrite existing non-OIDC team memberships", async () => {
    const user = await factory.User.create();
    const manualTeamAccount = await factory.TeamAccount.create({
      slug: "manual-team",
    });
    const oidcTeamAccount = await factory.TeamAccount.create({
      slug: "oidc-team",
    });
    await factory.TeamUser.create({
      userId: user.id,
      teamId: manualTeamAccount.teamId,
      userLevel: "member",
      lastAuthMethod: null,
      ssoSubject: null,
      ssoVerifiedAt: null,
    });
    await factory.TeamUser.create({
      userId: user.id,
      teamId: oidcTeamAccount.teamId,
      userLevel: "member",
      lastAuthMethod: "oidc",
      ssoSubject: "user-1",
      ssoVerifiedAt: new Date(0).toISOString(),
    });

    await syncOidcTeamMemberships({
      userId: user.id,
      subject: "user-1",
      groups: ["argos-admins"],
      mappings: [
        { group: "argos-admins", teamSlug: "manual-team", role: "owner" },
        { group: "argos-admins", teamSlug: "oidc-team", role: "owner" },
      ],
    });

    const manualMembership = await TeamUser.query()
      .findOne({ userId: user.id, teamId: manualTeamAccount.teamId })
      .throwIfNotFound();
    const oidcMembership = await TeamUser.query()
      .findOne({ userId: user.id, teamId: oidcTeamAccount.teamId })
      .throwIfNotFound();

    expect(manualMembership.userLevel).toBe("member");
    expect(manualMembership.lastAuthMethod).toBeNull();
    expect(manualMembership.ssoSubject).toBeNull();
    expect(oidcMembership.userLevel).toBe("owner");
    expect(oidcMembership.lastAuthMethod).toBe("oidc");
    expect(oidcMembership.ssoSubject).toBe("user-1");
  });
});
