import type Stripe from "stripe";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import config from "@/config";
import { Account, TeamUser } from "@/database/models";
import { factory, setupDatabase } from "@/database/testing";
import { stripe } from "@/stripe";

import { apolloServer, createApolloMiddleware } from "../apollo";
import { expectNoGraphQLError } from "../testing";
import { createApolloServerApp } from "./util";

const createTeamMutation = `
  mutation CreateTeam($name: String!) {
    createTeam(input: { name: $name }) {
      redirectUrl
      team {
        id
        slug
      }
    }
  }
`;

const originalStripeEnabled = config.get("stripe.enabled");
const originalStripeApiKey = config.get("stripe.apiKey");

describe("GraphQL createTeam", () => {
  beforeEach(async () => {
    await setupDatabase();
    vi.restoreAllMocks();
    config.set("stripe.enabled", originalStripeEnabled);
    config.set("stripe.apiKey", originalStripeApiKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    config.set("stripe.enabled", originalStripeEnabled);
    config.set("stripe.apiKey", originalStripeApiKey);
  });

  it("creates a team directly when Stripe billing uses the unconfigured sentinel", async () => {
    config.set("stripe.enabled", true);
    config.set("stripe.apiKey", "no-api-key");
    const userAccount = await factory.UserAccount.create();
    await userAccount.$fetchGraph("user");

    const app = await createApolloServerApp(
      apolloServer,
      createApolloMiddleware,
      {
        user: userAccount.user!,
        account: userAccount,
      },
    );

    const res = await request(app)
      .post("/graphql")
      .send({
        query: createTeamMutation,
        variables: { name: "agyn" },
      });

    expect(res.status).toBe(200);
    expectNoGraphQLError(res);
    expect(res.body.data.createTeam).toMatchObject({
      redirectUrl: "http://localhost:3000/agyn",
      team: { slug: "agyn" },
    });

    const teamAccount = await Account.query()
      .findOne({ slug: "agyn" })
      .throwIfNotFound();
    expect(teamAccount.teamId).toBeTruthy();
    await expect(
      TeamUser.query().findOne({
        teamId: teamAccount.teamId,
        userId: userAccount.userId,
        userLevel: "owner",
      }),
    ).resolves.toBeTruthy();
  });

  it("creates a team directly when Stripe API key is blank", async () => {
    config.set("stripe.enabled", true);
    config.set("stripe.apiKey", "  ");
    const userAccount = await factory.UserAccount.create();
    await userAccount.$fetchGraph("user");

    const app = await createApolloServerApp(
      apolloServer,
      createApolloMiddleware,
      {
        user: userAccount.user!,
        account: userAccount,
      },
    );

    const res = await request(app)
      .post("/graphql")
      .send({
        query: createTeamMutation,
        variables: { name: "agyn" },
      });

    expect(res.status).toBe(200);
    expectNoGraphQLError(res);
    expect(res.body.data.createTeam).toMatchObject({
      redirectUrl: "http://localhost:3000/agyn",
      team: { slug: "agyn" },
    });
  });

  it("returns an actionable error when billing is enabled without a Pro plan", async () => {
    config.set("stripe.enabled", true);
    config.set("stripe.apiKey", "sk_test_configured");
    const userAccount = await factory.UserAccount.create();
    await userAccount.$fetchGraph("user");

    const app = await createApolloServerApp(
      apolloServer,
      createApolloMiddleware,
      {
        user: userAccount.user!,
        account: userAccount,
      },
    );

    const res = await request(app)
      .post("/graphql")
      .send({
        query: createTeamMutation,
        variables: { name: "agyn" },
      });

    expect(res.status).toBe(200);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].message).toBe(
      "Stripe billing is enabled but the Pro billing plan is not configured.",
    );
    expect(res.body.errors[0].extensions).toMatchObject({
      code: "BAD_USER_INPUT",
    });
  });

  it("keeps redirecting to Stripe checkout when billing is enabled", async () => {
    config.set("stripe.enabled", true);
    config.set("stripe.apiKey", "sk_test_configured");
    const userAccount = await factory.UserAccount.create();
    await userAccount.$fetchGraph("user");
    const plan = await factory.Plan.create({
      name: "pro",
      usageBased: true,
      includedScreenshots: 35000,
      stripeProductId: "prod_pro",
    });
    await factory.Subscription.create({
      subscriberId: userAccount.userId,
      trialEndDate: new Date().toISOString(),
    });

    vi.spyOn(stripe.products, "list").mockResolvedValue({
      data: [
        {
          id: plan.stripeProductId,
          default_price: {
            id: "price_pro",
            recurring: { usage_type: "licensed" },
          },
        },
        {
          id: config.get("stripe.screenshotProductId"),
          default_price: {
            id: "price_screenshots",
            recurring: { usage_type: "metered" },
          },
        },
        {
          id: config.get("stripe.storybookScreenshotProductId"),
          default_price: {
            id: "price_storybook_screenshots",
            recurring: { usage_type: "metered" },
          },
        },
      ],
    } as Stripe.Response<Stripe.ApiList<Stripe.Product>>);
    vi.spyOn(stripe.checkout.sessions, "create").mockResolvedValue({
      url: "https://checkout.stripe.test/session",
    } as Stripe.Response<Stripe.Checkout.Session>);

    const app = await createApolloServerApp(
      apolloServer,
      createApolloMiddleware,
      {
        user: userAccount.user!,
        account: userAccount,
      },
    );

    const res = await request(app)
      .post("/graphql")
      .send({
        query: createTeamMutation,
        variables: { name: "agyn" },
      });

    expect(res.status).toBe(200);
    expectNoGraphQLError(res);
    expect(res.body.data.createTeam.redirectUrl).toBe(
      "https://checkout.stripe.test/session",
    );
    expect(stripe.checkout.sessions.create).toHaveBeenCalledOnce();
  });
});
