import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { analyzeRows } from "@/domains/imports/analyze";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Runs deterministic column/content detection against an already-uploaded
 * job's stored rows and returns a plain-language summary plus a ready-to-use
 * mapping. Used by the simplified upload flow to skip manual column mapping
 * for the common case; the same mapping shape can still be hand-edited via
 * the advanced mapping UI before /process is called.
 */
export const GET = withAuth<Ctx>("EDITOR", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const job = await db.importJob.findUnique({
    where: { id },
    include: { rows: { orderBy: { rowIndex: "asc" }, take: 5000 } },
  });
  if (!job) throw new ApiError(404, "Import job not found");
  if (job.status !== "MAPPING") throw new ApiError(400, `Job is ${job.status}, expected MAPPING`);

  const rows = job.rows.map((r) => r.rawData as Record<string, string>);
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const analysis = await analyzeRows(columns, rows);

  return NextResponse.json({ analysis });
});
