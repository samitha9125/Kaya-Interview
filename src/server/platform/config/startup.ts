import { parseConfig } from "./env";

type StartupDeps = {
  env: Record<string, string | undefined>;
  printError: (message: string) => void;
  exit: (code: number) => never;
};

export function exitOnInvalidConfig({
  env = process.env,
  printError = console.error,
  exit = process.exit,
}: Partial<StartupDeps> = {}): void {
  const result = parseConfig(env);
  if (result.ok) return;
  printError(result.message);
  exit(1);
}
