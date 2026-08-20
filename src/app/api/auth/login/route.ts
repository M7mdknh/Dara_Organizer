import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { jsonError } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Email and password are required");

  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.active) return jsonError(401, "Invalid email or password");

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return jsonError(401, "Invalid email or password");

  const session = await getSession();
  session.userId = user.id;
  await session.save();

  await db.auditLog.create({ data: { action: "auth.login", userId: user.id } });

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
