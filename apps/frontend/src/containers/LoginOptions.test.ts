import React from "react";
import type { ClientConfig } from "@argos/config-types";
import { Provider as JotaiProvider } from "jotai/react";
import { createStore } from "jotai/vanilla";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clientConfig: ClientConfig = {
  sentry: {
    environment: "test",
    clientDsn: "",
  },
  session: {
    domain: "",
  },
  email: {
    enabled: true,
  },
  auth: {
    loginMode: "oidc",
  },
  oidc: {
    enabled: true,
    displayName: "Keycloak",
  },
  samlTeamSlug: "",
  releaseVersion: "test",
  contactEmail: "contact@example.com",
  github: {
    appUrl: "https://github.com/apps/argos",
    clientId: "github-client-id",
    loginUrl: "https://github.com/login/oauth/authorize",
    marketplaceUrl: "https://github.com/marketplace/argos",
  },
  githubLight: {
    appUrl: "https://github.com/apps/argos-light",
  },
  gitlab: {
    loginUrl: "https://gitlab.com/oauth/authorize",
  },
  stripe: {
    pricingTableId: "",
    publishableKey: "",
  },
  server: {
    url: "https://app.argos-ci.dev",
  },
  api: {
    baseUrl: "https://api.argos-ci.dev",
  },
  deployments: {
    baseDomain: "argos-ci.dev",
  },
  bucket: {
    publishableKey: "",
  },
};

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ mutate: vi.fn() }),
}));

vi.mock("@hookform/resolvers/zod", () => ({
  zodResolver: () => vi.fn(),
}));

vi.mock("lucide-react", () => ({
  KeyRoundIcon: () => React.createElement("span", null),
  MailIcon: () => React.createElement("span", null),
}));

vi.mock("react-hook-form", () => ({
  useForm: () => ({
    control: {},
    formState: { isSubmitting: false },
    register: () => ({}),
    handleSubmit: () => vi.fn(),
    clearErrors: vi.fn(),
    setError: vi.fn(),
    setFocus: vi.fn(),
  }),
}));

vi.mock("@/containers/AuthWithEmail", () => ({
  AuthWithEmail: () => React.createElement("div", null),
}));

vi.mock("@/containers/GitHub", () => ({
  GitHubLoginButton: ({ children }: { children: React.ReactNode }) =>
    React.createElement("a", null, children),
}));

vi.mock("@/containers/GitLab", () => ({
  GitLabLoginButton: ({ children }: { children: React.ReactNode }) =>
    React.createElement("a", null, children),
}));

vi.mock("@/containers/Google", () => ({
  GoogleLoginButton: ({ children }: { children: React.ReactNode }) =>
    React.createElement("a", null, children),
}));

vi.mock("@/gql", () => ({
  graphql: () => ({}),
}));

vi.mock("@/ui/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) =>
    React.createElement("button", null, children),
  ButtonIcon: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  LinkButton: ({ children }: { children: React.ReactNode }) =>
    React.createElement("a", null, children),
}));

vi.mock("@/ui/Form", () => ({
  Form: ({ children }: { children: React.ReactNode }) =>
    React.createElement("form", null, children),
}));

vi.mock("@/ui/FormRootError", () => ({
  FormRootToastError: () => null,
}));

vi.mock("@/ui/FormSubmit", () => ({
  FormSubmit: ({ children }: { children: React.ReactNode }) =>
    React.createElement("button", null, children),
}));

vi.mock("@/ui/FormTextInput", () => ({
  FormTextInput: () => React.createElement("input", null),
}));

vi.mock("@/ui/Separator", () => ({
  Separator: () => React.createElement("hr", null),
}));

vi.mock("@/util/oauth", () => ({
  getOAuthURL: () => "https://app.argos-ci.dev/auth/oidc/login",
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", createStorage());
  vi.stubGlobal("sessionStorage", createStorage());
  vi.stubGlobal("window", {
    clientData: { config: clientConfig },
    location: {
      origin: "https://app.argos-ci.dev",
      pathname: "/login",
      search: "",
    },
    btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginOptions", () => {
  it("renders only the configured OIDC button in OIDC-only mode", async () => {
    const { LoginOptions } = await import("./LoginOptions");

    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/login"] },
        React.createElement(
          JotaiProvider,
          { store: createStore() },
          React.createElement(LoginOptions, {
            email: "",
            onEmailChange: () => {},
            onSamlLogin: () => {},
          }),
        ),
      ),
    );

    expect(html).toBeTruthy();
    assertProviderVisibility(html, {
      expected: "Continue with Keycloak",
      hidden: [
        "Continue with Google",
        "Continue with GitHub",
        "Continue with GitLab",
        "Continue with SAML SSO",
        "Continue with email",
      ],
    });
  });
});

function assertProviderVisibility(
  html: string,
  options: { expected: string; hidden: string[] },
) {
  expect(html).toContain(options.expected);

  for (const hiddenLabel of options.hidden) {
    expect(html).not.toContain(hiddenLabel);
  }
}
