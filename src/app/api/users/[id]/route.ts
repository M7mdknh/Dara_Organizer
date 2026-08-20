import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/hash";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "EDITOR", "REVIEWER", "VIEWER"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const PATCH = withAuth<Ctx>("ADMIN", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const { password, ...data } = await parseBody(req, patchSchema);
  if (id === user.id && data.role && data.role !== "ADMIN") {
    throw new ApiError(400, "You cannot remove your own admin role");
  }
  const updated = await db.user.update({
    where: { id },
    data: { ...data, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  await db.auditLog.create({ data: { action: "user.update", detail: { target: id, changes: Object.keys(data) }, userId: user.id } });
  return NextResponse.json({ item: updated });
});
