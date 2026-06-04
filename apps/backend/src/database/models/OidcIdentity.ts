import type { RelationMappings } from "objection";

import { Model } from "../util/model";
import { timestampsSchema } from "../util/schemas";
import { User } from "./User";

export class OidcIdentity extends Model {
  static override tableName = "oidc_identities";

  static override get jsonAttributes() {
    return ["groups"];
  }

  static override jsonSchema = {
    allOf: [
      timestampsSchema,
      {
        type: "object",
        required: ["issuer", "subject"],
        properties: {
          issuer: { type: "string" },
          subject: { type: "string" },
          email: { type: ["string", "null"] },
          emailVerified: { type: "boolean" },
          name: { type: ["string", "null"] },
          preferredUsername: { type: ["string", "null"] },
          groups: {
            anyOf: [
              { type: "array", items: { type: "string" } },
              { type: "null" },
            ],
          },
          lastLoggedAt: { type: ["string", "null"] },
        },
      },
    ],
  };

  issuer!: string;
  subject!: string;
  email!: string | null;
  emailVerified!: boolean;
  name!: string | null;
  preferredUsername!: string | null;
  groups!: string[] | null;
  lastLoggedAt!: string | null;

  static override get relationMappings(): RelationMappings {
    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: "oidc_identities.id",
          to: "users.oidcIdentityId",
        },
      },
    };
  }

  user?: User;
}
