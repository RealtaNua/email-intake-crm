/**
 * Fail fast on missing configuration.
 *
 * A missing env var in Vercel surfaces as a confusing runtime error deep in a
 * request handler. Reading it through here turns that into one clear message
 * naming the variable.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env.local for local dev, and in the Vercel project settings for deploys.`,
    );
  }
  return value;
}
