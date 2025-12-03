/**
 * GET /api/upload/status?uploadId=xxx
 * Get upload status and progress
 */

import { NextRequest, NextResponse } from "next/server"
import { getUploadSession, getUploadProgress } from "@/lib/storage/uploadUtils"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const uploadId = searchParams.get("uploadId")

    if (!uploadId) {
      return NextResponse.json({ error: "Missing uploadId parameter" }, { status: 400 })
    }

    // Get upload session
    const session = getUploadSession(uploadId)
    if (!session) {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 })
    }

    // Get progress
    const progress = getUploadProgress(uploadId)

    // Get uploaded part numbers
    const uploadedPartNumbers = Array.from(session.uploadedParts.keys()).sort((a, b) => a - b)

    return NextResponse.json({
      uploadId: session.uploadId,
      status: session.status,
      filename: session.filename,
      filesize: session.filesize,
      contentType: session.contentType,
      mode: session.mode,
      partSize: session.partSize,
      totalParts: session.totalParts,
      uploadedParts: progress.uploadedParts,
      uploadedPartNumbers,
      percentage: Math.round(progress.percentage * 100) / 100,
      uploadedSize: progress.uploadedSize,
      remainingSize: progress.totalSize - progress.uploadedSize,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    })
  } catch (error) {
    console.error("Upload status error:", error)
    return NextResponse.json(
      { error: "Failed to get upload status", details: (error as Error).message },
      { status: 500 }
    )
  }
}
