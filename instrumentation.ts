/**
 * Next.js instrumentation hook — runs once when the server process starts,
 * before any request is handled. Used to fail fast and clearly when
 * required production configuration is missing, rather than surfacing a
 * confusing error on the first request that touches it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadEnv } = await import("./src/lib/env");
    loadEnv();
  }
}
