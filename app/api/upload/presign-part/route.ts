/**
 * POST /api/upload/presign-part
 * Generate presigned URL for a specific part
 */

import { NextRequest, NextResponse } from "next/server"
import { getPresignedUrlForPart } from "@/lib/storage/s3Client"
import { getUploadSession } from "@/lib/storage/uploadUtils"

interface PresignPartRequest {
  uploadId: string
  partNumber: number
}

export async function POST(request: NextRequest) {
  try {
    const body: PresignPartRequest = await request.json()

    // Validate request
    if (!body.uploadId || !body.partNumber) {
      return NextResponse.json(
        { error: "Missing required fields: uploadId, partNumber" },
        { status: 400 }
      )
    }

    // Get upload session
    const session = getUploadSession(body.uploadId)
    if (!session) {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 })
    }

    // Validate part number
    if (body.partNumber < 1 || body.partNumber > session.totalParts) {
      return NextResponse.json(
        { error: `Invalid part number. Must be between 1 and ${session.totalParts}` },
        { status: 400 }
      )
    }

    // Generate presigned URL
    const url = await getPresignedUrlForPart(session.key, session.s3UploadId, body.partNumber)

    return NextResponse.json({
      partNumber: body.partNumber,
      url,
      expiresIn: 900, // 15 minutes
    })
  } catch (error) {
    console.error("Presign part error:", error)
    return NextResponse.json(
      { error: "Failed to generate presigned URL", details: (error as Error).message },
      { status: 500 }
    )
  }
}
