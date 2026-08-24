import { OAuth2Client } from "google-auth-library";
import { env } from "../env";
import { badRequest } from "../errors";

const client = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

// Verifies a Google Identity Services ID token sent from the frontend and returns the
// profile fields we need. Throws if GOOGLE_CLIENT_ID isn't configured or the token is invalid.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!client) throw badRequest("Google Sign-In is not configured on this server");

  const payload = await client
    .verifyIdToken({ idToken, audience: env.googleClientId })
    .then((ticket) => ticket.getPayload())
    .catch(() => undefined);
  if (!payload?.sub || !payload.email) throw badRequest("Invalid Google token");

  // We use this email to auto-link to (or create) an account, so it must be one Google itself
  // has confirmed the user controls — not just an email Google is passing through unverified.
  if (!payload.email_verified) throw badRequest("Google account email is not verified");

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
  };
}
