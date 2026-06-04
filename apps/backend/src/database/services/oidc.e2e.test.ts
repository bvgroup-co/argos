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
    const existingTeamAccount = await factory.TeamAccount.create({
      slug: "existing-team",
    });
    await factory.TeamUser.create({
      userId: user.id,
      teamId: existingTeamAccount.teamId,
      userLevel: "member",
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
    expect(levelBySlug.get("existing-team")).toBe("member");
  });
});
