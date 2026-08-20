import { env } from "@/lib/env";

/**
 * Minimal structured logger. Emits single-line JSON so logs are easy to
 * ship to any log aggregator. Never pass secrets (API keys, DB/S3/Redis
 * credentials) into `fields` — callers are responsible for that; this
 * module does not attempt to redact after the fact.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function log(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[env.LOG_LEVEL]) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => log("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => log("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => log("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => log("error", message, fields),
};
