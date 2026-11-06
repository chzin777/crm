import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const client = new S3Client({
  region: process.env.MINIO_REGION || "us-east-1",
  endpoint: `http://${process.env.MINIO_ENDPOINT || "localhost"}:${process.env.MINIO_PORT || "9000"}`,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || "",
    secretAccessKey: process.env.MINIO_SECRET_KEY || "",
  },
  forcePathStyle: true,
});

const BUCKET = process.env.MINIO_BUCKET || "crm-campaigns";
const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || "";

export async function ensureBucket(): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
}

export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  prefix = "campaigns"
): Promise<{ key: string; url: string }> {
  const key = `${prefix}/${randomUUID()}/${fileName}`;
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  const url = PUBLIC_URL ? `${PUBLIC_URL}/${BUCKET}/${key}` : "";
  return { key, url };
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

export function getPublicUrl(key: string): string {
  if (PUBLIC_URL) return `${PUBLIC_URL}/${BUCKET}/${key}`;
  return "";
}

export async function readFile(key: string): Promise<Buffer> {
  const object = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!object.Body) throw new Error("Arquivo vazio no armazenamento.");
  return Buffer.from(await object.Body.transformToByteArray());
}

export async function readFileStream(key: string, range?: string) {
  const object = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key, ...(range ? { Range: range } : {}) }));
  if (!object.Body) throw new Error("Arquivo vazio no armazenamento.");
  return { stream: object.Body.transformToWebStream(), contentLength: object.ContentLength };
}

export async function deleteFile(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
