import { redact, redactText } from "./redact";

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;
export type Logger = Record<LogLevel, (message: string, fields?: LogFields) => void>;

type LoggerDeps = {
  write: (line: string) => void;
  now: () => Date;
};

const RESERVED_KEYS = new Set(["time", "level", "msg"]);

export function createLogger({
  write = (line) => process.stdout.write(line),
  now = () => new Date(),
}: Partial<LoggerDeps> = {}): Logger {
  const log =
    (level: LogLevel) =>
    (message: string, fields: LogFields = {}) => {
      const extra = Object.entries(redact(fields)).filter(([key]) => !RESERVED_KEYS.has(key));
      const entry = { time: now().toISOString(), level, msg: redactText(message) };
      write(JSON.stringify({ ...entry, ...Object.fromEntries(extra) }) + "\n");
    };
  return { info: log("info"), warn: log("warn"), error: log("error") };
}

export const logger = createLogger();
