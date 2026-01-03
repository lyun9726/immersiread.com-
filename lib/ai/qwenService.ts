/**
 * Qwen (通义千问) AI Service
 * Unified AI service for all reading assistant features
 */

import { ReadingContext, AIExplainResponse, AISummaryResponse, AIAskResponse } from './types';

const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

interface QwenMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface QwenResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
    error?: {
        message: string;
        code: string;
    };
}

/**
 * Call Qwen API
 */
async function callQwen(
    messages: QwenMessage[],
    apiKey: string,
    model: string = 'qwen-turbo'
): Promise<string> {
    const response = await fetch(QWEN_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 1000,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[QwenService] API error:', response.status, errorText);
        throw new Error(`Qwen API error: ${response.status}`);
    }

    const data: QwenResponse = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    return data.choices[0]?.message?.content || '';
}

/**
 * Explain a term in the context of reading
 */
export async function explainTerm(
    term: string,
    context: Partial<ReadingContext>,
    apiKey: string
): Promise<AIExplainResponse> {
    const systemPrompt = `你是一个阅读助手，帮助读者理解书中的术语和概念。
规则：
- 用简洁清晰的语言解释
- 假设读者不是初学者，只需要快速澄清
- 保持简短，不超过100字
- 如果有上下文，结合上下文解释`;

    const userPrompt = context.visibleText
        ? `在以下文本中，请解释"${term}"的含义：

上下文：
${context.visibleText.substring(0, 500)}

术语：${term}`
        : `请解释术语"${term}"的含义。`;

    try {
        const explanation = await callQwen(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            apiKey
        );

        return {
            term,
            explanation,
            context: context.visibleText?.substring(0, 100),
        };
    } catch (error: any) {
        console.error('[QwenService] explainTerm error:', error);
        return {
            term,
            explanation: '',
            error: error.message,
        };
    }
}

/**
 * Generate summary of current chapter/page
 */
export async function generateSummary(
    context: ReadingContext,
    apiKey: string
): Promise<AISummaryResponse> {
    const systemPrompt = `你是一个阅读助手，帮助读者总结刚刚阅读的内容。
规则：
- 生成3-5个要点
- 聚焦关键思想，不是细节
- 每个要点不超过30字
- 总结不超过120字`;

    const userPrompt = `请总结以下文本的要点：

${context.visibleText.substring(0, 2000)}`;

    try {
        const result = await callQwen(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            apiKey
        );

        // Parse bullet points from response
        const lines = result.split('\n').filter(line => line.trim());
        const bulletPoints = lines.filter(line =>
            line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line)
        ).map(line => line.replace(/^[-•\d.]\s*/, '').trim());

        return {
            summary: result,
            bulletPoints: bulletPoints.length > 0 ? bulletPoints : lines.slice(0, 5),
        };
    } catch (error: any) {
        console.error('[QwenService] generateSummary error:', error);
        return {
            summary: '',
            bulletPoints: [],
            error: error.message,
        };
    }
}

/**
 * Ask a question about the book
 */
export async function askBook(
    question: string,
    context: ReadingContext,
    apiKey: string
): Promise<AIAskResponse> {
    const systemPrompt = `你是一个阅读助手，帮助读者理解书籍内容。
规则：
- 只基于提供的上下文回答
- 回答清晰简洁
- 如果上下文中没有相关信息，说明无法从当前内容中找到答案`;

    const userPrompt = `基于以下内容，回答问题。

内容：
${context.visibleText.substring(0, 2000)}

问题：${question}`;

    try {
        const answer = await callQwen(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            apiKey
        );

        return {
            answer,
        };
    } catch (error: any) {
        console.error('[QwenService] askBook error:', error);
        return {
            answer: '',
            error: error.message,
        };
    }
}

/**
 * Generate mindmap structure from text
 */
export async function generateMindmap(
    context: ReadingContext,
    apiKey: string
): Promise<AIMindmapResponse> {
    const systemPrompt = `你是一个阅读助手，帮助读者将文本内容转换为思维导图结构。
规则：
- 返回 JSON 格式的思维导图结构
- 中心主题是文本的核心概念
- 最多3层深度
- 每层最多5个节点
- 节点文本简洁，不超过20字

返回格式（严格遵守）：
{
  "title": "中心主题",
  "nodes": [
    {"id": "1", "text": "要点1", "children": [{"id": "1-1", "text": "子要点"}]},
    {"id": "2", "text": "要点2"}
  ]
}

只返回 JSON，不要其他内容。`;

    const userPrompt = `请将以下文本转换为思维导图结构：

${context.visibleText.substring(0, 2000)}`;

    try {
        const result = await callQwen(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            apiKey
        );

        // Parse JSON from response
        let parsed;
        try {
            // Try to extract JSON from response (may have markdown code blocks)
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('[QwenService] Failed to parse mindmap JSON:', parseError);
            // Fallback: create simple structure from text
            return {
                title: '内容概要',
                nodes: [
                    { id: '1', text: '无法解析思维导图结构' },
                    { id: '2', text: '请重试' }
                ],
                error: 'JSON parse failed'
            };
        }

        return {
            title: parsed.title || '思维导图',
            nodes: parsed.nodes || [],
        };
    } catch (error: any) {
        console.error('[QwenService] generateMindmap error:', error);
        return {
            title: '生成失败',
            nodes: [],
            error: error.message,
        };
    }
}

// Re-export types
export type { AIMindmapResponse } from './types';
