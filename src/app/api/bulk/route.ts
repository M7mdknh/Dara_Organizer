import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";

const bulkSchema = z.object({
  entityType: z.enum(["sentence", "expression", "conversation"]),
  ids: z.array(z.string()).min(1).max(1000),
  action: z.enum([
    "setDialect",
    "addCategory",
    "removeCategory",
    "addToCollection",
    "removeFromCollection",
    "verify",
    "unverify",
    "setQuality",
    "setTraining",
    "delete",
  ]),
  value: z.string().nullish(),
});

/** Bulk operations over selected records. Destructive actions require EDITOR+. */
export const POST = withAuth("REVIEWER", async (req, user) => {
  const { entityType, ids, action, value } = await parseBody(req, bulkSchema);

  const editorActions = new Set(["setDialect", "addCategory", "removeCategory", "addToCollection", "removeFromCollection", "setQuality", "setTraining", "delete"]);
  if (editorActions.has(action) && user.role !== "ADMIN" && user.role !== "EDITOR") {
    throw new ApiError(403, "This bulk action requires the Editor role");
  }
  if (action === "delete" && user.role !== "ADMIN") {
    throw new ApiError(403, "Bulk delete requires the Admin role");
  }

  let updated = 0;
  await db.$transaction(async (tx) => {
    const note = { action, value: value ?? null, count: ids.length };
    const revise = async (kind: "UPDATE" | "DELETE") => {
      for (const id of ids) {
        await recordRevision(tx, { entityType, entityId: id, kind, newValue: note, userId: user.id, reason: `Bulk ${action}` });
      }
    };
    switch (action) {
      case "setDialect": {
        if (!value) throw new ApiError(400, "Dialect id required");
        if (entityType === "sentence") ({ count: updated } = await tx.sentence.updateMany({ where: { id: { in: ids } }, data: { dialectId: value } }));
        else if (entityType === "expression") ({ count: updated } = await tx.expression.updateMany({ where: { id: { in: ids } }, data: { dialectId: value } }));
        else ({ count: updated } = await tx.conversation.updateMany({ where: { id: { in: ids } }, data: { dialectId: value } }));
        await revise("UPDATE");
        break;
      }
      case "addCategory": {
        if (!value) throw new ApiError(400, "Category id required");
        if (entityType === "sentence") {
          await tx.sentenceCategory.createMany({ data: ids.map((id) => ({ sentenceId: id, categoryId: value })), skipDuplicates: true });
        } else if (entityType === "expression") {
          await tx.expressionCategory.createMany({ data: ids.map((id) => ({ expressionId: id, categoryId: value })), skipDuplicates: true });
        } else {
          await tx.conversationCategory.createMany({ data: ids.map((id) => ({ conversationId: id, categoryId: value })), skipDuplicates: true });
        }
        updated = ids.length;
        break;
      }
      case "removeCategory": {
        if (!value) throw new ApiError(400, "Category id required");
        if (entityType === "sentence") await tx.sentenceCategory.deleteMany({ where: { sentenceId: { in: ids }, categoryId: value } });
        else if (entityType === "expression") await tx.expressionCategory.deleteMany({ where: { expressionId: { in: ids }, categoryId: value } });
        else await tx.conversationCategory.deleteMany({ where: { conversationId: { in: ids }, categoryId: value } });
        updated = ids.length;
        break;
      }
      case "addToCollection": {
        if (!value) throw new ApiError(400, "Collection id required");
        await tx.collectionItem.createMany({
          data: ids.map((id) => ({ collectionId: value, entityType, entityId: id })),
          skipDuplicates: true,
        });
        updated = ids.length;
        break;
      }
      case "removeFromCollection": {
        if (!value) throw new ApiError(400, "Collection id required");
        await tx.collectionItem.deleteMany({ where: { collectionId: value, entityType, entityId: { in: ids } } });
        updated = ids.length;
        break;
      }
      case "verify":
      case "unverify": {
        const data =
          action === "verify"
            ? { verification: "VERIFIED" as const, verifiedById: user.id, verifiedAt: new Date() }
            : { verification: "UNVERIFIED" as const, verifiedById: null, verifiedAt: null };
        if (entityType === "sentence") ({ count: updated } = await tx.sentence.updateMany({ where: { id: { in: ids } }, data }));
        else if (entityType === "expression") ({ count: updated } = await tx.expression.updateMany({ where: { id: { in: ids } }, data }));
        else ({ count: updated } = await tx.conversation.updateMany({ where: { id: { in: ids } }, data: { verification: data.verification } }));
        await revise("UPDATE");
        break;
      }
      case "setQuality": {
        if (!value || !["GOLD", "SILVER", "REFERENCE", "CANDIDATE"].includes(value)) throw new ApiError(400, "Invalid quality tier");
        const data = { quality: value as never };
        if (entityType === "sentence") ({ count: updated } = await tx.sentence.updateMany({ where: { id: { in: ids } }, data }));
        else if (entityType === "expression") ({ count: updated } = await tx.expression.updateMany({ where: { id: { in: ids } }, data }));
        else ({ count: updated } = await tx.conversation.updateMany({ where: { id: { in: ids } }, data }));
        await revise("UPDATE");
        break;
      }
      case "setTraining": {
        if (!value || !["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"].includes(value)) throw new ApiError(400, "Invalid training eligibility");
        const data = { training: value as never };
        if (entityType === "sentence") ({ count: updated } = await tx.sentence.updateMany({ where: { id: { in: ids } }, data }));
        else if (entityType === "expression") ({ count: updated } = await tx.expression.updateMany({ where: { id: { in: ids } }, data }));
        else ({ count: updated } = await tx.conversation.updateMany({ where: { id: { in: ids } }, data }));
        await revise("UPDATE");
        break;
      }
      case "delete": {
        await revise("DELETE");
        if (entityType === "sentence") ({ count: updated } = await tx.sentence.deleteMany({ where: { id: { in: ids } } }));
        else if (entityType === "expression") ({ count: updated } = await tx.expression.deleteMany({ where: { id: { in: ids } } }));
        else ({ count: updated } = await tx.conversation.deleteMany({ where: { id: { in: ids } } }));
        break;
      }
    }
  });

  return NextResponse.json({ ok: true, updated });
});
