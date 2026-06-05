import type { OidcUserProfile } from "@/oidc/auth";

import { OidcIdentity } from "../models/OidcIdentity";
import { getPartialModelUpdate } from "../util/update";

export async function getOrCreateOidcIdentity(
  profile: OidcUserProfile,
  data?: {
    lastLoggedAt?: string;
  },
): Promise<OidcIdentity> {
  const existing = await OidcIdentity.query().findOne({
    issuer: profile.issuer,
    subject: profile.subject,
  });
  if (existing) {
    const toUpdate = getPartialModelUpdate(existing, {
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name,
      preferredUsername: profile.preferredUsername,
      groups: profile.groups,
      ...data,
    });
    if (toUpdate) {
      return existing.$query().patchAndFetch(toUpdate);
    }
    return existing;
  }

  return OidcIdentity.query().insertAndFetch({
    issuer: profile.issuer,
    subject: profile.subject,
    email: profile.email,
    emailVerified: profile.emailVerified,
    name: profile.name,
    preferredUsername: profile.preferredUsername,
    groups: profile.groups,
    ...data,
  });
}
