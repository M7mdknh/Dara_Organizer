import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * S3-compatible object storage abstraction. Works with AWS S3, Cloudflare
 * R2, DigitalOcean Spaces, MinIO, and other S3-compatible providers —
 * nothing here is AWS-specific. Uploaded source files, dataset exports, and
 * (future) audio/video all live here; the database only stores metadata and
 * object keys, never large blobs.
 *
 * STORAGE_PROVIDER=local is a dev-only fallback for environments without an
 * S3-compatible service configured; it does not persist files durably and
 * must not be used in production (enforced by env validation).
 */

export interface StoredObject {
  key: string;
  size: number;
  checksum: string; // sha256 hex
  mimeType: string;
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: env.S3_REGION || "us-east-1",
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return client;
}

export function storageEnabled(): boolean {
  return env.STORAGE_PROVIDER === "s3" && !!env.S3_BUCKET;
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Stores a file under `imports/`, `exports/`, `audio/`, or `video/`. The
 * caller supplies a stable key (e.g. `imports/<sourceId>/original.xlsx`) —
 * this function never overwrites a *different* logical object under a key
 * that already holds different content; callers preserve immutability by
 * always deriving keys from an id that is itself immutable (source id,
 * dataset export id).
 */
export async function putObject(key: string, buffer: Buffer, mimeType: string): Promise<StoredObject> {
  if (!storageEnabled()) {
    throw new Error("Object storage is not configured (STORAGE_PROVIDER=s3 with S3_BUCKET required)");
  }
  const checksum = sha256(buffer);
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: { sha256: checksum },
    }),
  );
  return { key, size: buffer.length, checksum, mimeType };
}

export async function getObject(key: string): Promise<Buffer> {
  if (!storageEnabled()) throw new Error("Object storage is not configured");
  const res = await getClient().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  const body = res.Body;
  if (!body) throw new Error(`Object not found: ${key}`);
  const chunks: Uint8Array[] = [];
  // @ts-expect-error -- Body is a Node Readable at runtime for the Node.js S3 client
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

export async function storageHealthy(): Promise<boolean> {
  if (!storageEnabled()) return false;
  try {
    await getClient().send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    return true;
  } catch {
    return false;
  }
}

export function importObjectKey(sourceId: string, originalFilename: string): string {
  const ext = originalFilename.includes(".") ? originalFilename.slice(originalFilename.lastIndexOf(".")) : "";
  return `${env.IMPORT_STORAGE_PREFIX}${sourceId}/original${ext}`;
}

export function exportObjectKey(datasetId: string, exportId: string, format: string, split?: string | null): string {
  const suffix = split ? `_${split.toLowerCase()}` : "";
  return `${env.EXPORT_STORAGE_PREFIX}${datasetId}/${exportId}${suffix}.${format}`;
}
