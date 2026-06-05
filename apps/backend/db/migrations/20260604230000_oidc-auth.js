/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable("oidc_identities", (table) => {
    table.bigIncrements("id").primary();
    table.dateTime("createdAt").notNullable();
    table.dateTime("updatedAt").notNullable();
    table.string("issuer").notNullable();
    table.string("subject").notNullable();
    table.string("email");
    table.boolean("emailVerified").notNullable().defaultTo(false);
    table.string("name");
    table.string("preferredUsername");
    table.jsonb("groups");
    table.dateTime("lastLoggedAt");

    table.unique(["issuer", "subject"]);
  });

  await knex.schema.alterTable("users", (table) => {
    table.bigInteger("oidcIdentityId").index();
    table.foreign("oidcIdentityId").references("oidc_identities.id");
  });

  await knex.raw(`
    ALTER TABLE team_users
    DROP CONSTRAINT IF EXISTS "team_users_lastAuthMethod_check"
  `);
  await knex.raw(`
    ALTER TABLE team_users
    ADD CONSTRAINT "team_users_lastAuthMethod_check"
    CHECK ("lastAuthMethod" IN ('email', 'google', 'github', 'gitlab', 'saml', 'oidc'))
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.raw(`
    ALTER TABLE team_users
    DROP CONSTRAINT IF EXISTS "team_users_lastAuthMethod_check"
  `);
  await knex.raw(`
    ALTER TABLE team_users
    ADD CONSTRAINT "team_users_lastAuthMethod_check"
    CHECK ("lastAuthMethod" IN ('email', 'google', 'github', 'gitlab', 'saml'))
  `);

  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("oidcIdentityId");
  });

  await knex.schema.dropTable("oidc_identities");
};
