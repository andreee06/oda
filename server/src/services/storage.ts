import { randomBytes } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../lib/config.js";
import { ApiError } from "../lib/errors.js";

// MinIO in dev, any S3-compatible store in prod — same API either way.
const s3 = new S3Client({
  endpoint: config.MINIO_ENDPOINT,
  region: "us-east-1", // MinIO ignores it, the SDK requires it
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.MINIO_ROOT_USER,
    secretAccessKey: config.MINIO_ROOT_PASSWORD,
  },
});

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Store an image and return its public path. Paths are /media/<bucket>/<key>;
 * vite (dev) and caddy (prod) proxy /media → the bucket.
 */
export async function uploadFile(
  data: Buffer,
  contentType: string,
): Promise<string> {
  const ext = EXT_BY_MIME[contentType];
  if (!ext) throw new ApiError(415, "unsupported content type — images only");

  const key = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: config.MINIO_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
    }),
  );
  return `/media/${config.MINIO_BUCKET}/${key}`;
}
