import { KeyRoundIcon } from "lucide-react";

import { ButtonIcon, LinkButton, LinkButtonProps } from "@/ui/Button";
import { getOAuthURL } from "@/util/oauth";

export function OidcLoginButton({
  children,
  redirect,
  ...props
}: Omit<LinkButtonProps, "children" | "variant" | "href"> & {
  children?: React.ReactNode;
  redirect?: string | null;
}) {
  const url = getOAuthURL({
    provider: "oidc",
    redirect: redirect ?? null,
  });
  return (
    <LinkButton variant="secondary" href={url} {...props}>
      <ButtonIcon>
        <KeyRoundIcon />
      </ButtonIcon>
      {children ?? "Login with SSO"}
    </LinkButton>
  );
}
