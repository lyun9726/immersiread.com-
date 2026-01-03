/**
 * API Route: Explain Term
 * POST /api/ai/explain
 */

import { NextRequest, NextResponse } from 'next/server';
import { explainTerm } from '@/lib/ai/qwenService';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { term, context } = body;

        if (!term) {
            return NextResponse.json(
                { error: 'Term is required' },
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

        console.log(`[API] Explaining term: "${term.substring(0, 50)}..."`);

        const result = await explainTerm(term, context || {}, apiKey);

        if (result.error) {
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[API] Explain term error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to explain term' },
            { status: 500 }
        );
    }
}
