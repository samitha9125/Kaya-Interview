import { z } from "zod";

const BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;
const WHOLE_NUMBER = /^\d+$/;
const MAX_BASIS_POINTS = 10_000;

// An empty line in a .env file means "not set". Without this, an empty
// threshold would coerce to 0 and auto-decide every case.
const unsetIfEmpty = (value: unknown) => (value === "" ? undefined : value);

const ConfigSchema = z.object({
  APP_ENCRYPTION_KEY: z
    .string({ error: "missing" })
    .regex(BASE64_32_BYTES, { error: "must be 32 bytes, base64-encoded" })
    .transform((value) => Buffer.from(value, "base64")),
  AUTO_DECISION_THRESHOLD: z.preprocess(
    unsetIfEmpty,
    z
      .string()
      .regex(WHOLE_NUMBER, { error: "must be whole basis points, e.g. 9500 for 95%" })
      .transform(Number)
      .pipe(
        z
          .number()
          .min(0, { error: "must be between 0 and 10000 basis points" })
          .max(MAX_BASIS_POINTS, { error: "must be between 0 and 10000 basis points" }),
      )
      .default(9_500),
  ),
  CREDIT_CACHE_TTL_DAYS: z.preprocess(
    unsetIfEmpty,
    z
      .string()
      .regex(WHOLE_NUMBER, { error: "must be a whole number of days" })
      .transform(Number)
      .pipe(z.number().min(1, { error: "must be at least 1 day" }))
      .default(30),
  ),
  DEMO_MODE: z.preprocess(
    unsetIfEmpty,
    z
      .enum(["true", "false"], { error: "must be true or false" })
      .default("false")
      .transform((value) => value === "true"),
  ),
  OPENROUTER_API_KEY: z.preprocess(unsetIfEmpty, z.string().optional()),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; message: string };

export function parseConfig(env: Record<string, string | undefined>): ConfigResult {
  const parsed = ConfigSchema.safeParse(env);
  if (parsed.success) return { ok: true, config: parsed.data };
  // Only variable names and our own messages: a value may be a secret.
  const problems = parsed.error.issues.map(
    (issue) => `- ${issue.path.join(".")}: ${issue.message}`,
  );
  return {
    ok: false,
    message: [
      "The app can't start: fix these environment variables and restart.",
      ...problems,
      "See .env.example for what each one means.",
    ].join("\n"),
  };
}
