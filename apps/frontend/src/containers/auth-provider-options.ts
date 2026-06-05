import type { ClientConfig } from "@argos/config-types";

export type AuthProviderOption =
  | "google"
  | "oidc"
  | "github"
  | "gitlab"
  | "saml";
export type SignupProviderOption = Exclude<AuthProviderOption, "saml">;

export function getAuthProviderOptions(
  config: Pick<ClientConfig, "auth" | "oidc">,
): AuthProviderOption[] {
  if (config.auth.loginMode === "oidc") {
    return config.oidc.enabled ? ["oidc"] : [];
  }

  const options: AuthProviderOption[] = ["google"];

  if (config.oidc.enabled) {
    options.push("oidc");
  }

  options.push("github", "gitlab", "saml");

  return options;
}

export function getSignupProviderOptions(
  config: Pick<ClientConfig, "auth" | "oidc">,
): SignupProviderOption[] {
  return getAuthProviderOptions(config).filter(
    (provider): provider is SignupProviderOption => provider !== "saml",
  );
}

export function getOidcLoginLabel(config: Pick<ClientConfig, "oidc">): string {
  return `Continue with ${config.oidc.displayName}`;
}
