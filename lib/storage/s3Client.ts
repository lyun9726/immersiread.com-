/**
 * S3 Client Wrapper for Multipart Upload
 * Supports AWS S3, Cloudflare R2, and Supabase Storage
 */

import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// Initialize S3 Client
export const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
  // For Cloudflare R2, uncomment and configure:
  // endpoint: process.env.R2_ENDPOINT,
  // region: "auto",
})

export const S3_BUCKET = process.env.S3_BUCKET || "my-bucket"

/**
 * Initialize multipart upload
 */
export async function initMultipartUpload(key: string, contentType: string) {
  const command = new CreateMultipartUploadCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  })

  const response = await s3Client.send(command)
  return {
    uploadId: response.UploadId!,
    key: response.Key!,
  }
}

/**
 * Generate presigned URL for uploading a part
 */
export async function getPresignedUrlForPart(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn: number = 900 // 15 minutes
) {
  const command = new UploadPartCommand({
    Bucket: S3_BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  })

  const url = await getSignedUrl(s3Client, command, { expiresIn })
  return url
}

/**
 * Upload a part directly (server-side)
 */
export async function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer
) {
  const command = new UploadPartCommand({
    Bucket: S3_BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
    Body: body,
  })

  const response = await s3Client.send(command)
  return {
    ETag: response.ETag!,
    PartNumber: partNumber,
  }
}

/**
 * Complete multipart upload
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>
) {
  const command = new CompleteMultipartUploadCommand({
    Bucket: S3_BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
    },
  })

  const response = await s3Client.send(command)
  return {
    location: response.Location!,
    bucket: response.Bucket!,
    key: response.Key!,
    etag: response.ETag!,
  }
}

/**
 * Abort multipart upload
 */
export async function abortMultipartUpload(key: string, uploadId: string) {
  const command = new AbortMultipartUploadCommand({
    Bucket: S3_BUCKET,
    Key: key,
    UploadId: uploadId,
  })

  await s3Client.send(command)
}

/**
 * List uploaded parts
 */
export async function listParts(key: string, uploadId: string) {
  const command = new ListPartsCommand({
    Bucket: S3_BUCKET,
    Key: key,
    UploadId: uploadId,
  })

  const response = await s3Client.send(command)
  return response.Parts || []
}

/**
 * Get file URL after upload
 */
export function getFileUrl(key: string): string {
  // For AWS S3
  const region = process.env.AWS_REGION || "us-east-1"
  return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`

  // For Cloudflare R2 with custom domain:
  // return `https://your-domain.com/${key}`

  // For Supabase Storage:
  // return `${process.env.SUPABASE_URL}/storage/v1/object/public/${S3_BUCKET}/${key}`
}

/**
 * Get presigned URL for downloading a file
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  })

  return await getSignedUrl(s3Client, command, { expiresIn })
}

/**
 * Check if file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
    await s3Client.send(command)
    return true
  } catch (error) {
    return false
  }
}
