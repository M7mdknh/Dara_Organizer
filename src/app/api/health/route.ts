import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { pingRedis } from "@/lib/redis";
import { storageEnabled, storageHealthy } from "@/services/storage";
import { backgroundJobsAvailable } from "@/lib/queue";

/**
 * Liveness/readiness check. No secrets are ever included in the response —
 * only boolean/enum status per dependency.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
  }

  if (env.REDIS_URL) {
    const redisOk = await pingRedis();
    checks.redis = { ok: redisOk };
  } else {
    checks.redis = { ok: true, detail: "not configured" };
  }

  if (storageEnabled()) {
    const storageOk = await storageHealthy();
    checks.storage = { ok: storageOk };
  } else {
    checks.storage = { ok: true, detail: "not configured (local fallback)" };
  }

  const healthy = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      backgroundJobsAvailable: backgroundJobsAvailable(),
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
