import IORedis from "ioredis";
import { env } from "@/lib/env";

let client: IORedis | null = null;

/** Shared Redis connection for BullMQ. Only created if REDIS_URL is set. */
export function getRedisConnection(): IORedis | null {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
  }
  return client;
}

export async function pingRedis(): Promise<boolean> {
  const conn = getRedisConnection();
  if (!conn) return false;
  try {
    const res = await conn.ping();
    return res === "PONG";
  } catch {
    return false;
  }
}
