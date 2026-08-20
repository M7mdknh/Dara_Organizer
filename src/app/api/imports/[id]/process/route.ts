import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { importMappingSchema, processImportJob } from "@/domains/imports/service";
import { enqueueOrRun, JOB_TYPES, backgroundJobsAvailable } from "@/lib/queue";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  mapping: importMappingSchema,
  sourceName: z.string().optional(),
  saveTemplate: z.string().optional(), // save the mapping as a reusable template
});

/**
 * Starts matching. When background jobs are available the request returns
 * immediately with status QUEUED and the caller polls GET /api/imports/[id]
 * for durable progress; otherwise matching runs inline and the finished
 * job is returned directly (small local imports, or Redis not configured).
 */
export const POST = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  const job = await db.importJob.findUnique({ where: { id } });
  if (!job) throw new ApiError(404, "Import job not found");
  if (job.status !== "MAPPING") throw new ApiError(400, `Job is ${job.status}, expected MAPPING`);

  await db.importJob.update({
    where: { id },
    data: { mapping: body.mapping as unknown as Prisma.InputJsonValue },
  });
  if (body.sourceName) {
    await db.source.update({ where: { id: job.sourceId }, data: { name: body.sourceName } });
  }
  if (body.saveTemplate) {
    await db.importTemplate.upsert({
      where: { name: body.saveTemplate },
      create: { name: body.saveTemplate, mapping: body.mapping as unknown as Prisma.InputJsonValue },
      update: { mapping: body.mapping as unknown as Prisma.InputJsonValue },
    });
  }

  const outcome = await enqueueOrRun(JOB_TYPES.IMPORT_MATCH, { jobId: id, userId: user.id }, () => processImportJob(id, user.id));

  if (outcome.mode === "queued") {
    await db.importJob.update({ where: { id }, data: { status: "QUEUED" } });
    return NextResponse.json({ queued: true, jobId: outcome.jobId, backgroundJobs: backgroundJobsAvailable() });
  }
  return NextResponse.json({ item: outcome.result, backgroundJobs: false });
});
