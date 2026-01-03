/**
 * API Route: Generate Summary
 * POST /api/ai/summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSummary } from '@/lib/ai/qwenService';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { context } = body;

        if (!context?.visibleText) {
            return NextResponse.json(
                { error: 'Visible text context is required' },
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

        console.log(`[API] Generate summary for ${context.visibleText.length} chars`);

        const result = await generateSummary(context, apiKey);

        if (result.error) {
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[API] Generate summary error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate summary' },
            { status: 500 }
        );
    }
}
