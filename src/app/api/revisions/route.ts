import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { listRevisions } from "@/services/revisions";

export const GET = withAuth("VIEWER", async (req) => {
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if (!entityType || !entityId) throw new ApiError(400, "entityType and entityId are required");
  return NextResponse.json({ items: await listRevisions(entityType, entityId) });
});
