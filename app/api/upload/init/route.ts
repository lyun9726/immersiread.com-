/**
 * POST /api/upload/init
 * Initialize upload session
 * - Small files (< 5MB): Returns simple PUT presigned URL
 * - Large files (>= 5MB): Returns multipart upload session
 */

import { NextRequest, NextResponse } from "next/server"
import { initMultipartUpload, getPresignedUrlForPart, getPresignedPutUrl, S3_BUCKET } from "@/lib/storage/s3Client"
import {
  createUploadSession,
  generateFileKey,
} from "@/lib/storage/uploadUtils"

// Threshold for simple PUT vs multipart (5MB)
const SIMPLE_UPLOAD_THRESHOLD = 5 * 1024 * 1024

interface InitUploadRequest {
  filename: string
  filesize: number
  contentType: string
  mode: "direct" | "server"
}

export async function POST(request: NextRequest) {
  try {
    const body: InitUploadRequest = await request.json()

    // Validate request
    if (!body.filename || !body.filesize || !body.contentType || !body.mode) {
      return NextResponse.json(
        { error: "Missing required fields: filename, filesize, contentType, mode" },
        { status: 400 }
      )
    }

    // Validate file size (max 10GB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024 // 10GB
    if (body.filesize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes` },
        { status: 400 }
      )
    }

    if (body.filesize <= 0) {
      return NextResponse.json({ error: "Invalid file size" }, { status: 400 })
    }

    // Validate mode
    if (body.mode !== "direct" && body.mode !== "server") {
      return NextResponse.json(
        { error: 'Invalid mode. Must be "direct" or "server"' },
        { status: 400 }
      )
    }

    // Generate unique file key
    const key = generateFileKey(body.filename)

    // ============================================
    // SMALL FILE: Use simple PUT upload
    // ============================================
    if (body.filesize < SIMPLE_UPLOAD_THRESHOLD) {
      console.log(`[Upload Init] Small file detected (${body.filesize} bytes), using simple PUT`)

      const presignedUrl = await getPresignedPutUrl(key, body.contentType)

      // Build the final file URL
      const fileUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`

      return NextResponse.json({
        uploadType: "simple", // New field to indicate simple upload
        key,
        presignedUrl,
        fileUrl,
      })
    }

    // ============================================
    // LARGE FILE: Use multipart upload
    // ============================================
    console.log(`[Upload Init] Large file detected (${body.filesize} bytes), using multipart`)

    // Initialize S3 multipart upload
    const { uploadId: s3UploadId } = await initMultipartUpload(key, body.contentType)

    // Create upload session
    const session = createUploadSession({
      s3UploadId,
      key,
      filename: body.filename,
      filesize: body.filesize,
      contentType: body.contentType,
      mode: body.mode,
    })

    // For direct mode, generate presigned URLs for all parts
    let presignedParts: Array<{ partNumber: number; url: string }> = []
    if (body.mode === "direct") {
      const { partSize, totalParts } = session

      // Generate presigned URLs for all parts (or first batch)
      const batchSize = Math.min(totalParts, 100)

      presignedParts = await Promise.all(
        Array.from({ length: batchSize }, async (_, i) => {
          const partNumber = i + 1
          const url = await getPresignedUrlForPart(key, s3UploadId, partNumber)
          return { partNumber, url }
        })
      )
    }

    return NextResponse.json({
      uploadType: "multipart", // New field to indicate multipart upload
      uploadId: session.uploadId,
      s3UploadId: session.s3UploadId,
      key: session.key,
      uploadMode: session.mode,
      partSize: session.partSize,
      totalParts: session.totalParts,
      presignedParts: body.mode === "direct" ? presignedParts : undefined,
    })
  } catch (error) {
    console.error("Upload init error:", error)
    return NextResponse.json(
      { error: "Failed to initialize upload", details: (error as Error).message },
      { status: 500 }
    )
  }
}
