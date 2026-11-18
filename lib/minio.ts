import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
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
  // Com Range, o armazenamento devolve o checksum do objeto inteiro e a validação padrão quebra a leitura.
  responseChecksumValidation: "WHEN_REQUIRED",
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

/** Grava num caminho exato (sem o prefixo aleatório de uploadFile). */
export async function putFile(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

/**
 * Envio em partes (arquivos grandes, como vídeos): cada parte passa pelo app em requisições pequenas,
 * respeitando os limites de corpo do proxy e do Cloudflare. Partes de no mínimo 5 MB (exceto a última).
 */
export async function startMultipartUpload(key: string, contentType: string): Promise<string> {
  const result = await client.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }));
  if (!result.UploadId) throw new Error("O armazenamento não iniciou o envio.");
  return result.UploadId;
}

export async function uploadMultipartPart(key: string, uploadId: string, partNumber: number, body: Buffer): Promise<string> {
  const result = await client.send(new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body }));
  if (!result.ETag) throw new Error("O armazenamento não confirmou a parte enviada.");
  return result.ETag;
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) },
  }));
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await client.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }));
}

export async function deleteFile(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
