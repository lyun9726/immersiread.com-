/**
 * POST /api/podcast/generate
 * Proxy to Python podcast service
 */

import { NextRequest, NextResponse } from 'next/server'

const PODCAST_SERVICE_URL = process.env.PODCAST_SERVICE_URL || 'http://localhost:8000'

interface GenerateRequest {
    text: string
    style?: 'casual' | 'academic' | 'storytelling'
    language?: 'en' | 'zh' | 'bilingual'
    title?: string
}

export async function POST(request: NextRequest) {
    try {
        const body: GenerateRequest = await request.json()

        if (!body.text || body.text.trim().length < 100) {
            return NextResponse.json(
                { error: '内容至少需要 100 个字符' },
                { status: 400 }
            )
        }

        // Call Python podcast service
        const response = await fetch(`${PODCAST_SERVICE_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: body.text,
                style: body.style || 'casual',
                language: body.language || 'en',
                title: body.title,
            }),
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            return NextResponse.json(
                { error: errorData.detail || '播客生成服务不可用' },
                { status: response.status }
            )
        }

        const data = await response.json()
        return NextResponse.json(data)

    } catch (error) {
        console.error('[Podcast API] Error:', error)

        // Check if it's a connection error
        if ((error as Error).message?.includes('ECONNREFUSED')) {
            return NextResponse.json(
                { error: '播客服务未启动，请先启动 Python 服务' },
                { status: 503 }
            )
        }

        return NextResponse.json(
            { error: '生成播客时出错' },
            { status: 500 }
        )
    }
}
