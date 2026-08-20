import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/hash";

export const GET = withAuth("ADMIN", async () => {
  const items = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ items });
});

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "EDITOR", "REVIEWER", "VIEWER"]),
});

export const POST = withAuth("ADMIN", async (req, user) => {
  const data = await parseBody(req, createSchema);
  const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new ApiError(400, "A user with this email already exists");
  const created = await db.user.create({
    data: {
      email: data.email.toLowerCase(),
      name: data.name,
      role: data.role,
      passwordHash: await hashPassword(data.password),
    },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  await db.auditLog.create({ data: { action: "user.create", detail: { email: created.email, role: created.role }, userId: user.id } });
  return NextResponse.json({ item: created }, { status: 201 });
});
