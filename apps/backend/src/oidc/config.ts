import { z } from "zod";

const OidcTeamUserLevelSchema = z.enum(["owner", "member", "contributor"]);

const OidcGroupTeamMappingSchema = z.object({
  group: z.string().min(1),
  teamSlug: z.string().min(1),
  role: OidcTeamUserLevelSchema,
});

export function parseOidcGroupTeamMappings(value: unknown) {
  return z.array(OidcGroupTeamMappingSchema).parse(value);
}
