/**
 * TimelineHighlighter.ts
 * 
 * 基于时间轴的高亮控制器
 * 
 * 核心原则：
 * - 高亮来源：时间轴，不是浏览器 boundary
 * - 用 RAF / setInterval 推进 charProgress
 * - 映射到 charOffset → DOM range
 * 
 * ❌ 禁止依赖 onboundary.word / 浏览器 boundary 精度
 */

export interface HighlightRange {
    startOffset: number;
    endOffset: number;
    node?: HTMLElement;
}

export interface TimelineHighlighterOptions {
    /** 每秒朗读的字符数（用于时间轴模拟） */
    charsPerSecond?: number;
    /** 高亮更新回调 */
    onHighlightChange?: (range: HighlightRange | null) => void;
    /** Block 高亮更新回调 */
    onBlockHighlightChange?: (blockId: string | null) => void;
}

/**
 * 时间轴高亮控制器
 */
class TimelineHighlighterClass {
    private isActive = false;
    private startTime = 0;
    private startOffset = 0;
    private textLength = 0;
    private charsPerSecond = 15; // 默认每秒 15 个字符
    private rafId: number | null = null;

    private currentHighlight: HighlightRange | null = null;
    private currentBlockId: string | null = null;

    private sentences: Array<{ id: string; start: number; end: number; node?: HTMLElement }> = [];

    private onHighlightChange?: (range: HighlightRange | null) => void;
    private onBlockHighlightChange?: (blockId: string | null) => void;

    /**
     * 配置高亮器
     */
    configure(options: TimelineHighlighterOptions): void {
        if (options.charsPerSecond) this.charsPerSecond = options.charsPerSecond;
        if (options.onHighlightChange) this.onHighlightChange = options.onHighlightChange;
        if (options.onBlockHighlightChange) this.onBlockHighlightChange = options.onBlockHighlightChange;
    }

    /**
     * 设置当前朗读的句子列表
     */
    setSentences(sentences: Array<{ id: string; start: number; end: number; node?: HTMLElement }>): void {
        this.sentences = sentences;
        console.log('[TimelineHighlighter] setSentences:', sentences.length);
    }

    /**
     * 开始高亮追踪
     */
    start(startOffset: number, textLength: number, rate: number = 1.0): void {
        this.stop();

        this.isActive = true;
        this.startTime = performance.now();
        this.startOffset = startOffset;
        this.textLength = textLength;

        // 根据语速调整每秒字符数
        const adjustedCharsPerSecond = this.charsPerSecond * rate;

        console.log('[TimelineHighlighter] start:', { startOffset, textLength, rate, cps: adjustedCharsPerSecond });

        this.tick(adjustedCharsPerSecond);
    }

    /**
     * 暂停高亮追踪
     */
    pause(): void {
        this.isActive = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * 恢复高亮追踪
     */
    resume(rate: number = 1.0): void {
        if (!this.isActive) {
            this.isActive = true;
            this.startTime = performance.now();
            const adjustedCharsPerSecond = this.charsPerSecond * rate;
            this.tick(adjustedCharsPerSecond);
        }
    }

    /**
     * 停止高亮追踪
     */
    stop(): void {
        this.isActive = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.clearHighlights();
    }

    /**
     * 清除所有高亮
     */
    clearHighlights(): void {
        this.currentHighlight = null;
        this.currentBlockId = null;
        this.onHighlightChange?.(null);
        this.onBlockHighlightChange?.(null);

        // 清除 DOM 中的高亮类
        document.querySelectorAll('.tts-highlight-sentence, .tts-highlight-block').forEach(el => {
            el.classList.remove('tts-highlight-sentence', 'tts-highlight-block');
        });
    }

    /**
     * 获取当前高亮位置
     */
    getCurrentOffset(): number {
        return this.currentHighlight?.startOffset ?? this.startOffset;
    }

    /**
     * 时间轴推进
     */
    private tick = (charsPerSecond: number): void => {
        if (!this.isActive) return;

        const elapsed = (performance.now() - this.startTime) / 1000;
        const charProgress = Math.floor(elapsed * charsPerSecond);
        const currentOffset = this.startOffset + charProgress;

        // 检查是否超出范围
        if (charProgress >= this.textLength) {
            console.log('[TimelineHighlighter] Reached end');
            this.stop();
            return;
        }

        // 查找当前应该高亮的句子
        const currentSentence = this.findSentenceByOffset(currentOffset);
        if (currentSentence) {
            this.updateHighlight(currentSentence);
        }

        // 继续下一帧
        this.rafId = requestAnimationFrame(() => this.tick(charsPerSecond));
    };

    /**
     * 根据 offset 查找句子
     */
    private findSentenceByOffset(offset: number): typeof this.sentences[0] | null {
        for (const s of this.sentences) {
            if (offset >= s.start && offset < s.end) {
                return s;
            }
        }
        return null;
    }

    /**
     * 更新高亮
     */
    private updateHighlight(sentence: typeof this.sentences[0]): void {
        // 避免重复更新同一句子
        if (this.currentHighlight?.startOffset === sentence.start) return;

        // 清除旧高亮
        if (this.currentHighlight?.node) {
            this.currentHighlight.node.classList.remove('tts-highlight-sentence');
        }

        // 设置新高亮
        this.currentHighlight = {
            startOffset: sentence.start,
            endOffset: sentence.end,
            node: sentence.node,
        };

        if (sentence.node) {
            sentence.node.classList.add('tts-highlight-sentence');
        }

        this.onHighlightChange?.(this.currentHighlight);

        // 更新 block 高亮
        const blockNode = sentence.node?.closest('[data-block-id]') as HTMLElement | null;
        const blockId = blockNode?.dataset?.blockId;
        if (blockId && blockId !== this.currentBlockId) {
            // 清除旧 block 高亮
            document.querySelectorAll('.tts-highlight-block').forEach(el => {
                el.classList.remove('tts-highlight-block');
            });

            this.currentBlockId = blockId;
            blockNode?.classList.add('tts-highlight-block');
            this.onBlockHighlightChange?.(blockId);
        }
    }
}

// 单例导出
export const timelineHighlighter = new TimelineHighlighterClass();
