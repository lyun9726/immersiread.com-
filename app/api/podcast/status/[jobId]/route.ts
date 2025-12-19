/**
 * GET /api/podcast/status/[jobId]
 * Check podcast generation status
 */

import { NextRequest, NextResponse } from 'next/server'

const PODCAST_SERVICE_URL = process.env.PODCAST_SERVICE_URL || 'http://localhost:8000'

export async function GET(
    request: NextRequest,
    { params }: { params: { jobId: string } }
) {
    try {
        const { jobId } = params

        const response = await fetch(`${PODCAST_SERVICE_URL}/status/${jobId}`)

        if (!response.ok) {
            if (response.status === 404) {
                return NextResponse.json(
                    { error: '任务不存在' },
                    { status: 404 }
                )
            }
            return NextResponse.json(
                { error: '查询状态失败' },
                { status: response.status }
            )
        }

        const data = await response.json()

        // Rewrite audio URL to go through our proxy
        if (data.audio_url) {
            data.audio_url = `/api/podcast/audio/${data.job_id}.mp3`
        }

        return NextResponse.json(data)

    } catch (error) {
        console.error('[Podcast Status] Error:', error)
        return NextResponse.json(
            { error: '服务不可用' },
            { status: 503 }
        )
    }
}
