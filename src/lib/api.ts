import { NextResponse } from "next/server";
import { z } from "zod";
import type { Role, User } from "@prisma/client";
import { getCurrentUser, hasRole } from "@/lib/session";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Wraps a route handler with auth + role check + uniform error handling. */
export function withAuth<Ctx>(
  required: Role,
  handler: (req: Request, user: User, ctx: Ctx) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (!user) return jsonError(401, "Not authenticated");
      if (!hasRole(user.role, required)) return jsonError(403, "Insufficient permissions");
      return await handler(req, user, ctx);
    } catch (err) {
      if (err instanceof ApiError) return jsonError(err.status, err.message);
      if (err instanceof z.ZodError) {
        return jsonError(400, err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      }
      console.error("API error:", err);
      return jsonError(500, "Internal server error");
    }
  };
}

export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  return schema.parse(body);
}

export function pageParams(req: Request, defaultSize = 50, maxSize = 200) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number(url.searchParams.get("pageSize") ?? defaultSize) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, url };
}
