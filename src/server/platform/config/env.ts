import { z } from "zod";
import { DEFAULT_DATABASE_PATH } from "../db/config";

const BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;
const WHOLE_NUMBER = /^\d+$/;
const MAX_BASIS_POINTS = 10_000;

// An empty line in a .env file means "not set". Without this, an empty
// threshold would coerce to 0 and auto-decide every case.
const unsetIfEmpty = (value: unknown) => (value === "" ? undefined : value);

const EnvFields = z.object({
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
      // No longer than the 90-day stale window (BR-CRED-02), or a score
      // too old to stand in as stale would still be served as fresh.
      .pipe(
        z
          .number()
          .min(1, { error: "must be at least 1 day" })
          .max(90, { error: "must be at most 90 days, the stale window" }),
      )
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
  // Not operator settings (TD27). The browser tests point DATABASE_PATH at
  // their own file and turn on the rule-played model (TD25); Next.js sets
  // PORT, which locates the built-in mock government API on this server.
  DATABASE_PATH: z.preprocess(unsetIfEmpty, z.string().default(DEFAULT_DATABASE_PATH)),
  PORT: z.preprocess(unsetIfEmpty, z.coerce.number().int().positive().default(3000)),
  E2E_SCRIPTED_MODEL: z.preprocess(
    unsetIfEmpty,
    z
      .enum(["1"], { error: "must be 1 or unset" })
      .optional()
      .transform((value) => value === "1"),
  ),
});

// The scripted model can't stand in for a real one by accident: it starts
// only in demo mode.
const ConfigSchema = EnvFields.refine((config) => !config.E2E_SCRIPTED_MODEL || config.DEMO_MODE, {
  path: ["E2E_SCRIPTED_MODEL"],
  error: "the scripted model is for the browser tests: it needs DEMO_MODE=true",
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
