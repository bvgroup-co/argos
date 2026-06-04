import { describe, expect, it } from "vitest";

import { parseOidcGroupTeamMappings } from "./config";

describe("parseOidcGroupTeamMappings", () => {
  it("parses valid group-to-team mappings", () => {
    expect(
      parseOidcGroupTeamMappings([
        { group: "argos-users", teamSlug: "argos", role: "member" },
      ]),
    ).toEqual([{ group: "argos-users", teamSlug: "argos", role: "member" }]);
  });

  it("rejects invalid roles", () => {
    expect(() =>
      parseOidcGroupTeamMappings([
        { group: "argos-users", teamSlug: "argos", role: "admin" },
      ]),
    ).toThrow();
  });
});
