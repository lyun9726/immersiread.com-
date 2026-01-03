/**
 * API Route: Ask Book
 * POST /api/ai/ask
 */

import { NextRequest, NextResponse } from 'next/server';
import { askBook } from '@/lib/ai/qwenService';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { question, context } = body;

        if (!question) {
            return NextResponse.json(
                { error: 'Question is required' },
                { status: 400 }
            );
        }

        const apiKey = process.env.QWEN_API_KEY;
        if (!apiKey) {
            console.error('[API] QWEN_API_KEY not configured');
            return NextResponse.json(
                { error: 'AI service not configured' },
                { status: 500 }
            );
        }

        console.log(`[API] Ask book: "${question.substring(0, 50)}..."`);

        const result = await askBook(question, context || {}, apiKey);

        if (result.error) {
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[API] Ask book error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to answer question' },
            { status: 500 }
        );
    }
}
