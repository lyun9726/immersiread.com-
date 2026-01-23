/**
 * POST /api/storage/presign
 * Generate a presigned download URL for an S3 object
 * 
 * Used by guest/local books to get fresh presigned URLs
 * since the original presigned URL may have expired
 */

import { NextRequest, NextResponse } from "next/server"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"

export async function POST(request: NextRequest) {
    try {
        const { sourceUrl } = await request.json()

        if (!sourceUrl) {
            return NextResponse.json(
                { error: "sourceUrl is required" },
                { status: 400 }
            )
        }

        // Extract S3 key from URL
        // URL format: https://bucket.s3.region.amazonaws.com/key
        // or: https://s3.region.amazonaws.com/bucket/key
        let s3Key: string | null = null

        if (sourceUrl.includes('.s3.') || sourceUrl.includes('s3.amazonaws.com')) {
            const urlParts = sourceUrl.split('amazonaws.com/')
            if (urlParts.length > 1) {
                // Remove any query params from the key
                s3Key = urlParts[1].split('?')[0]
            }
        }

        if (!s3Key) {
            // Not an S3 URL, just return the original
            return NextResponse.json({ presignedUrl: sourceUrl })
        }

        // Generate fresh presigned URL
        const presignedUrl = await getPresignedDownloadUrl(s3Key)

        console.log(`[Presign] Generated presigned URL for key: ${s3Key.substring(0, 50)}...`)

        return NextResponse.json({ presignedUrl })
    } catch (error) {
        console.error("[Presign] Error:", error)
        return NextResponse.json(
            { error: "Failed to generate presigned URL" },
            { status: 500 }
        )
    }
}
