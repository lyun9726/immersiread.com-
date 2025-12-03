/**
 * POST /api/upload/init
 * Initialize multipart upload session
 */

import { NextRequest, NextResponse } from "next/server"
import { initMultipartUpload, getPresignedUrlForPart } from "@/lib/storage/s3Client"
import {
  createUploadSession,
  generateFileKey,
  calculatePartSize,
  calculateTotalParts,
} from "@/lib/storage/uploadUtils"

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

    // Validate file size (max 10GB for example)
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
    let presignedParts = []
    if (body.mode === "direct") {
      const { partSize, totalParts } = session

      // Generate presigned URLs for all parts (or first batch)
      // For very large files, you might want to generate URLs on-demand
      const batchSize = Math.min(totalParts, 100) // Generate first 100 parts

      presignedParts = await Promise.all(
        Array.from({ length: batchSize }, async (_, i) => {
          const partNumber = i + 1
          const url = await getPresignedUrlForPart(key, s3UploadId, partNumber)
          return { partNumber, url }
        })
      )
    }

    return NextResponse.json({
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
