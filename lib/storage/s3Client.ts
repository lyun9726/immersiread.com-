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

// Validate environment variables
function validateEnvVars() {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET']
  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    console.error('[S3Client] Missing environment variables:', missing.join(', '))
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Please configure them in Vercel dashboard.`)
  }
}

// Validate on initialization
validateEnvVars()

// Initialize S3 Client
export const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export const S3_BUCKET = process.env.S3_BUCKET!

console.log(`[S3Client] Initialized with bucket: ${S3_BUCKET}, region: ${process.env.AWS_REGION}`)

/**
 * Initialize multipart upload
 */
export async function initMultipartUpload(key: string, contentType: string) {
  try {
    const command = new CreateMultipartUploadCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    })

    const response = await s3Client.send(command)
    console.log(`[S3Client] Initialized multipart upload for key: ${key}, uploadId: ${response.UploadId}`)
    
    return {
      uploadId: response.UploadId!,
      key: response.Key!,
    }
  } catch (error) {
    console.error('[S3Client] Error initializing multipart upload:', error)
    throw error
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
  try {
    const command = new UploadPartCommand({
      Bucket: S3_BUCKET,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    })

    const url = await getSignedUrl(s3Client, command, { expiresIn })
    return url
  } catch (error) {
    console.error(`[S3Client] Error generating presigned URL for part ${partNumber}:`, error)
    throw error
  }
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
  try {
    const command = new CompleteMultipartUploadCommand({
      Bucket: S3_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    })

    const response = await s3Client.send(command)
    console.log(`[S3Client] Completed multipart upload for key: ${key}`)
    
    return {
      location: response.Location!,
      bucket: response.Bucket!,
      key: response.Key!,
      etag: response.ETag!,
    }
  } catch (error) {
    console.error('[S3Client] Error completing multipart upload:', error)
    throw error
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
  const region = process.env.AWS_REGION!
  return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`
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
