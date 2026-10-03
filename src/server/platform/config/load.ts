import { parseConfig, type AppConfig } from "./env";

export class ConfigError extends Error {
  override name = "ConfigError";
}

let loaded: AppConfig | undefined;

export function getConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  if (loaded) return loaded;
  const result = parseConfig(env);
  if (!result.ok) throw new ConfigError(result.message);
  loaded = result.config;
  return loaded;
}
