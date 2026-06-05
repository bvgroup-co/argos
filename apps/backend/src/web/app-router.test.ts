import { describe, expect, it } from "vitest";

import { createConfig } from "@/config";

import { createClientConfig } from "./app-router";

describe("client config", () => {
  it("includes OIDC display name from environment", () => {
    process.env["OIDC_DISPLAY_NAME"] = "Keycloak";

    try {
      const clientConfig = createClientConfig(createConfig());

      expect(clientConfig.oidc.displayName).toBe("Keycloak");
    } finally {
      delete process.env["OIDC_DISPLAY_NAME"];
    }
  });
});
