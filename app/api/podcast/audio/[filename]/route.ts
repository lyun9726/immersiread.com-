/**
 * GET /api/podcast/audio/[filename]
 * Proxy audio files from Python service
 */

import { NextRequest, NextResponse } from 'next/server'

const PODCAST_SERVICE_URL = process.env.PODCAST_SERVICE_URL || 'http://localhost:8000'

export async function GET(
    request: NextRequest,
    { params }: { params: { filename: string } }
) {
    try {
        const { filename } = params

        const response = await fetch(`${PODCAST_SERVICE_URL}/audio/${filename}`)

        if (!response.ok) {
            return NextResponse.json(
                { error: '音频文件不存在' },
                { status: 404 }
            )
        }

        const audioBuffer = await response.arrayBuffer()

        return new NextResponse(audioBuffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Disposition': `inline; filename="${filename}"`,
                'Cache-Control': 'public, max-age=3600',
            },
        })

    } catch (error) {
        console.error('[Podcast Audio] Error:', error)
        return NextResponse.json(
            { error: '获取音频失败' },
            { status: 500 }
        )
    }
}
