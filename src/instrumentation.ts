// Next.js runs register() once per server start, before any request.
// Checking config here is what makes P0-16 hold: a bad security setting
// stops the server instead of failing on some later request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { exitOnInvalidConfig } = await import("@/server/platform/config/startup");
    exitOnInvalidConfig();
  }
}
