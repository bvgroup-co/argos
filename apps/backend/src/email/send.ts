import { render } from "react-email";
import { Resend } from "resend";

import config from "@/config";
import logger from "@/logger";

const production = config.get("env") === "production";
const emailEnabled = config.get("resend.enabled");
const resendApiKey = config.get("resend.apiKey");

// Resend throws if API key is missing
// It is tolerable in test and development but not in production
const resend =
  emailEnabled && (resendApiKey || production)
    ? new Resend(config.get("resend.apiKey"))
    : null;

const defaultFrom = "Argos <contact@argos-ci.com>";

/**
 * Send an email using Resend.
 */
export async function sendEmail(options: {
  /**
   * Email address to send to.
   */
  to: string[];
  /**
   * Email subject.
   */
  subject: string;
  /**
   * Email body as React element.
   */
  react: React.ReactElement;
}) {
  if (!emailEnabled) {
    logger.info({ to: options.to, subject: options.subject }, "Email skipped");
    return null;
  }
  if (production) {
    if (!resend) {
      throw new Error("RESEND_API_KEY is required when EMAIL_ENABLED=true");
    }
  } else if (!resend) {
    return null;
  }
  const text = await render(options.react, { plainText: true });
  return resend.emails.send({ ...options, text, from: defaultFrom });
}
