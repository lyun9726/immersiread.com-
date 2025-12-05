/**
 * POST /api/upload/presign
 * Generate presigned URLs for additional parts on-demand
 */

import { NextRequest, NextResponse } from "next/server"
import { getPresignedUrlForPart } from "@/lib/storage/s3Client"
import { getUploadSession } from "@/lib/storage/uploadUtils"

interface PresignRequest {
  uploadId: string
  partNumbers: number[]
}

export async function POST(request: NextRequest) {
  try {
    const body: PresignRequest = await request.json()

    // Validate request
    if (!body.uploadId || !body.partNumbers || !Array.isArray(body.partNumbers)) {
      return NextResponse.json(
        { error: "Missing or invalid fields: uploadId, partNumbers" },
        { status: 400 }
      )
    }

    // Get session
    const session = getUploadSession(body.uploadId)
    if (!session) {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 })
    }

    // Limit batch size to prevent timeout
    if (body.partNumbers.length > 20) {
      return NextResponse.json(
        { error: "Too many parts requested at once. Maximum 20 per request." },
        { status: 400 }
      )
    }

    // Validate part numbers
    for (const partNumber of body.partNumbers) {
      if (partNumber < 1 || partNumber > session.totalParts) {
        return NextResponse.json(
          { error: `Invalid part number: ${partNumber}. Must be between 1 and ${session.totalParts}` },
          { status: 400 }
        )
      }
    }

    const startTime = Date.now()
    console.log(`[Presign] Generating ${body.partNumbers.length} URLs for upload ${body.uploadId}`)

    // Generate presigned URLs
    const presignedParts = await Promise.all(
      body.partNumbers.map(async (partNumber) => {
        const url = await getPresignedUrlForPart(session.key, session.s3UploadId, partNumber)
        return { partNumber, url }
      })
    )

    const elapsed = Date.now() - startTime
    console.log(`[Presign] Generated ${presignedParts.length} URLs in ${elapsed}ms`)

    return NextResponse.json({ presignedParts })
  } catch (error) {
    console.error("[Presign] Error:", error)
    return NextResponse.json(
      { error: "Failed to generate presigned URLs", details: (error as Error).message },
      { status: 500 }
    )
  }
}
