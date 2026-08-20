import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import {
  buildDataset,
  datasetFiltersSchema,
  splitStrategySchema,
  queryDatasetSentences,
} from "@/domains/datasets/service";

export const GET = withAuth("VIEWER", async () => {
  const items = await db.datasetVersion.findMany({
    include: { createdBy: { select: { id: true, name: true } }, _count: { select: { records: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
});

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  filters: datasetFiltersSchema,
  splitStrategy: splitStrategySchema,
  exportSchema: z.enum(["standard", "lean"]).optional(),
  previewOnly: z.boolean().optional(),
});

export const POST = withAuth("EDITOR", async (req, user) => {
  const body = await parseBody(req, createSchema);
  if (body.previewOnly) {
    if (body.filters.entity === "sentence") {
      const sentences = await queryDatasetSentences(body.filters);
      return NextResponse.json({ preview: { count: sentences.length } });
    }
    return NextResponse.json({ preview: { count: null } });
  }
  const dataset = await buildDataset(
    {
      name: body.name,
      description: body.description,
      filters: body.filters,
      splitStrategy: body.splitStrategy,
      exportSchema: body.exportSchema,
    },
    user.id,
  );
  return NextResponse.json({ item: dataset }, { status: 201 });
});
