/**
 * POST /api/upload/complete
 * Complete multipart upload
 */

import { NextRequest, NextResponse } from "next/server"
import { completeMultipartUpload, getFileUrl } from "@/lib/storage/s3Client"
import {
  getUploadSession,
  updateUploadedPart,
  isUploadComplete,
  completeUploadSession,
  getUploadedParts,
} from "@/lib/storage/uploadUtils"

interface CompleteUploadRequest {
  uploadId: string
  parts: Array<{ partNumber: number; etag: string; size?: number }>
}

export async function POST(request: NextRequest) {
  try {
    const body: CompleteUploadRequest = await request.json()

    // Validate request
    if (!body.uploadId || !body.parts || !Array.isArray(body.parts)) {
      return NextResponse.json(
        { error: "Missing required fields: uploadId, parts" },
        { status: 400 }
      )
    }

    // Get upload session
    const session = getUploadSession(body.uploadId)
    if (!session) {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 })
    }

    // Update uploaded parts
    for (const part of body.parts) {
      if (!part.partNumber || !part.etag) {
        return NextResponse.json(
          { error: "Each part must have partNumber and etag" },
          { status: 400 }
        )
      }

      // Validate part number
      if (part.partNumber < 1 || part.partNumber > session.totalParts) {
        return NextResponse.json(
          { error: `Invalid part number: ${part.partNumber}` },
          { status: 400 }
        )
      }

      // Update part in session
      const partSize = part.size || session.partSize
      updateUploadedPart(body.uploadId, part.partNumber, part.etag, partSize)
    }

    // Check if all parts are uploaded
    if (!isUploadComplete(body.uploadId)) {
      return NextResponse.json(
        {
          error: "Not all parts uploaded",
          uploaded: session.uploadedParts.size,
          total: session.totalParts,
        },
        { status: 400 }
      )
    }

    // Get all uploaded parts
    const uploadedParts = getUploadedParts(body.uploadId)

    // Complete multipart upload on S3
    const result = await completeMultipartUpload(
      session.key,
      session.s3UploadId,
      uploadedParts
    )

    // Mark session as completed
    completeUploadSession(body.uploadId)

    // Get file URL
    const fileUrl = getFileUrl(session.key)

    return NextResponse.json({
      status: "completed",
      fileUrl,
      key: result.key,
      bucket: result.bucket,
      etag: result.etag,
      uploadId: body.uploadId,
      totalParts: session.totalParts,
      filesize: session.filesize,
    })
  } catch (error) {
    console.error("Upload complete error:", error)
    return NextResponse.json(
      { error: "Failed to complete upload", details: (error as Error).message },
      { status: 500 }
    )
  }
}
