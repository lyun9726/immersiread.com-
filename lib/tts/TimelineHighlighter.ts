/**
 * TimelineHighlighter.ts
 * 
 * 🎯 时间轴词级高亮
 * 
 * 核心思想：
 * 朗读是连续时间，高亮是时间函数，而不是语义事件
 * 
 * 输入：text + startCharOffset + duration
 * 输出：highlightCharOffset（当前应该高亮的全书 charOffset）
 * 
 * 双语模式：
 * - 原文是驱动源，译文被动跟随
 * - 使用 BilingualAlignment 映射 offset
 * 
 * ❌ 不依赖 onboundary
 * ❌ 不滚动
 * ❌ 不翻页
 * ✅ 连续、可控、精准到字
 */

import { bilingualAlignment } from './BilingualAlignment';

export interface Token {
    text: string;
    start: number;  // 全书级 charOffset
    end: number;    // 全书级 charOffset
}

export interface TimelineHighlighterConfig {
    /** 每个字符的平均朗读时间（毫秒） */
    averageCharMs?: number;
    /** 高亮更新回调 */
    onHighlightUpdate?: (charOffset: number, token: Token | null) => void;
    /** 译文高亮更新回调 */
    onTranslatedHighlightUpdate?: (translatedOffset: number | null) => void;
    /** 时间轴结束回调 */
    onTimelineEnd?: () => void;
}

// 默认每字符 50ms（适合中等语速）
const DEFAULT_CHAR_MS = 50;

/**
 * 时间轴高亮器
 */
class TimelineHighlighterClass {
    private isActive = false;
    private startTime = 0;
    private durationMs = 0;
    private tokens: Token[] = [];
    private rafId: number | null = null;
    private currentTokenIndex = -1;

    private config: TimelineHighlighterConfig = {
        averageCharMs: DEFAULT_CHAR_MS,
    };

    /**
     * 配置高亮器
     */
    configure(config: TimelineHighlighterConfig): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * 从文本构建 token 列表并启动时间轴
     * 
     * @param text - 本次朗读文本
     * @param startCharOffset - 全书级起始 charOffset
     * @param rate - 语速倍率（1.0 = 正常）
     */
    start(text: string, startCharOffset: number, rate: number = 1.0): void {
        this.stop();

        // 1️⃣ 切词
        const rawTokens = this.tokenize(text);
        if (rawTokens.length === 0) {
            console.warn('[TimelineHighlighter] No tokens to highlight');
            return;
        }

        // 2️⃣ 构建 charOffset 映射
        this.tokens = this.buildCharMap(rawTokens, startCharOffset);

        // 3️⃣ 估算时长
        const baseMs = text.length * (this.config.averageCharMs || DEFAULT_CHAR_MS);
        this.durationMs = baseMs / rate; // 语速越快，时长越短

        console.log('[TimelineHighlighter] start:', {
            tokenCount: this.tokens.length,
            startOffset: startCharOffset,
            durationMs: this.durationMs,
        });

        // 4️⃣ 启动时间轴
        this.isActive = true;
        this.startTime = performance.now();
        this.currentTokenIndex = -1;
        this.tick();
    }

    /**
     * 暂停时间轴
     */
    pause(): void {
        this.isActive = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * 恢复时间轴
     */
    resume(): void {
        if (!this.isActive && this.tokens.length > 0) {
            this.isActive = true;
            // 从当前位置继续
            this.startTime = performance.now() - (this.currentTokenIndex / this.tokens.length) * this.durationMs;
            this.tick();
        }
    }

    /**
     * 停止时间轴并清除高亮
     */
    stop(): void {
        this.isActive = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.tokens = [];
        this.currentTokenIndex = -1;
        this.clearHighlight();
    }

    /**
     * 获取当前 token
     */
    getCurrentToken(): Token | null {
        if (this.currentTokenIndex >= 0 && this.currentTokenIndex < this.tokens.length) {
            return this.tokens[this.currentTokenIndex];
        }
        return null;
    }

    /**
     * 获取当前 charOffset
     */
    getCurrentCharOffset(): number {
        const token = this.getCurrentToken();
        return token?.start ?? 0;
    }

    // ============ 内部方法 ============

    /**
     * 切词（语言无关）
     * 
     * 英文：按空格/标点分
     * 中文：每个字就是 token
     * 日文：假名粒度
     */
    private tokenize(text: string): string[] {
        return text
            .split(/(\s+|[,.!?;:，。！？；：、""''《》【】])/)
            .filter(t => t && t.trim().length > 0);
    }

    /**
     * 构建 token → charOffset 映射
     */
    private buildCharMap(tokens: string[], startOffset: number): Token[] {
        let offset = startOffset;

        return tokens.map(text => {
            const entry: Token = {
                text,
                start: offset,
                end: offset + text.length,
            };
            offset += text.length;
            // 加上分隔符的长度（假设 1 个空格）
            if (!this.isPunctuation(text)) {
                offset += 1;
            }
            return entry;
        });
    }

    /**
     * 检查是否是标点
     */
    private isPunctuation(text: string): boolean {
        return /^[,.!?;:，。！？；：、""''《》【】\s]+$/.test(text);
    }

    /**
     * 时间轴推进
     */
    private tick = (): void => {
        if (!this.isActive) return;

        const now = performance.now();
        const elapsed = now - this.startTime;
        const progress = Math.min(elapsed / this.durationMs, 1);

        // 计算当前应该高亮的 token
        const tokenIndex = Math.floor(progress * this.tokens.length);

        // 只在 token 变化时更新
        if (tokenIndex !== this.currentTokenIndex && tokenIndex < this.tokens.length) {
            this.currentTokenIndex = tokenIndex;
            const token = this.tokens[tokenIndex];

            if (token) {
                this.config.onHighlightUpdate?.(token.start, token);
                this.renderHighlight(token);
            }
        }

        // 继续或结束
        if (progress < 1) {
            this.rafId = requestAnimationFrame(this.tick);
        } else {
            console.log('[TimelineHighlighter] Timeline ended');
            this.isActive = false;
            this.config.onTimelineEnd?.();
        }
    };

    /**
     * 渲染高亮（DOM 操作）
     * 
     * 双语模式：原文是驱动源，译文被动跟随
     */
    private renderHighlight(token: Token): void {
        // 清除旧高亮
        document.querySelectorAll('.tts-highlight-word, .tts-highlight-translation').forEach(el => {
            el.classList.remove('tts-highlight-word', 'tts-highlight-translation');
        });

        // 1️⃣ 高亮原文
        const targetNode = this.findNodeByCharOffset(token.start);
        if (targetNode) {
            targetNode.classList.add('tts-highlight-word');
        }

        // 2️⃣ 双语模式：同步高亮译文
        if (bilingualAlignment.isActive()) {
            const translatedOffset = bilingualAlignment.getTranslatedOffset(token.start);
            if (translatedOffset !== null) {
                this.config.onTranslatedHighlightUpdate?.(translatedOffset);
                this.renderTranslatedHighlight(translatedOffset);
            }
        }
    }

    /**
     * 渲染译文高亮
     */
    private renderTranslatedHighlight(offset: number): void {
        // 查找译文节点
        const nodes = document.querySelectorAll('[data-type="translation"], .translation');
        let accumulatedOffset = 0;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i] as HTMLElement;
            const text = node.textContent || '';
            const cleanText = text.replace(/\s+/g, ' ').trim();
            const nodeEnd = accumulatedOffset + cleanText.length;

            if (offset >= accumulatedOffset && offset < nodeEnd) {
                node.classList.add('tts-highlight-translation');
                return;
            }

            accumulatedOffset = nodeEnd + 1;
        }
    }

    /**
     * 根据 charOffset 查找对应的 DOM 节点
     */
    private findNodeByCharOffset(charOffset: number): HTMLElement | null {
        let accumulatedOffset = 0;

        // 查找所有 sentence 节点
        const nodes = document.querySelectorAll('[data-sentence-id]');

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i] as HTMLElement;
            const text = node.textContent || '';
            const cleanText = text.replace(/\s+/g, ' ').trim();
            const nodeStart = accumulatedOffset;
            const nodeEnd = accumulatedOffset + cleanText.length;

            if (charOffset >= nodeStart && charOffset < nodeEnd) {
                return node;
            }

            accumulatedOffset = nodeEnd + 1; // +1 for space
        }

        return null;
    }

    /**
     * 清除所有高亮
     */
    private clearHighlight(): void {
        document.querySelectorAll('.tts-highlight-word, .tts-highlight-sentence').forEach(el => {
            el.classList.remove('tts-highlight-word', 'tts-highlight-sentence');
        });
    }
}

// 单例导出
export const timelineHighlighter = new TimelineHighlighterClass();
