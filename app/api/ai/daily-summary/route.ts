/**
 * API Route: Generate Daily Summary
 * POST /api/ai/daily-summary
 * 
 * 自动生成当天阅读内容的总结
 */

import { NextRequest, NextResponse } from 'next/server';

const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { bookTitle, content, chaptersRead, totalWords } = body;

        if (!content || content.trim().length < 100) {
            return NextResponse.json(
                { error: 'Not enough content to summarize' },
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

        console.log(`[API] Generating daily summary for "${bookTitle}", ${totalWords} words`);

        const systemPrompt = `你是一个阅读助手，帮助用户总结今天的阅读内容。
规则：
- 生成一个简短的总体概述（1-2句话）
- 列出 3-5 个关键要点
- 语言简洁清晰
- 帮助用户回忆今天学到的内容

输出格式：
概述：[1-2句话总结]

要点：
- [要点1]
- [要点2]
- [要点3]`;

        const userPrompt = `用户今天阅读了《${bookTitle}》。
阅读章节：${chaptersRead?.join(', ') || '未知'}
阅读字数：约 ${totalWords} 字

阅读内容：
${content.substring(0, 4000)}

请生成今日阅读总结。`;

        const response = await fetch(QWEN_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'qwen-turbo',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 800,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[API] Qwen API error:', response.status, errorText);
            return NextResponse.json(
                { error: `AI service error: ${response.status}` },
                { status: 500 }
            );
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content || '';

        // 解析概述和要点
        const overviewMatch = result.match(/概述[：:]\s*([^\n]+)/);
        const overview = overviewMatch ? overviewMatch[1].trim() : result.split('\n')[0];

        // 解析要点
        const bulletPoints: string[] = [];
        const lines = result.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('-') || trimmed.startsWith('•') || /^\d+[.、]/.test(trimmed)) {
                const point = trimmed.replace(/^[-•\d.、]\s*/, '').trim();
                if (point) bulletPoints.push(point);
            }
        }

        return NextResponse.json({
            summary: overview || result,
            bulletPoints: bulletPoints.length > 0 ? bulletPoints : [overview],
            bookTitle,
            chaptersRead,
            totalWords,
        });
    } catch (error: any) {
        console.error('[API] Daily summary error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate daily summary' },
            { status: 500 }
        );
    }
}
