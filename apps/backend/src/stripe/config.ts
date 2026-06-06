import config from "@/config";

const UNCONFIGURED_STRIPE_API_KEY = "no-api-key";

export function checkIsStripeTeamBillingEnabled() {
  const apiKey = config.get("stripe.apiKey").trim();

  return (
    config.get("stripe.enabled") &&
    apiKey !== UNCONFIGURED_STRIPE_API_KEY &&
    apiKey !== ""
  );
}
