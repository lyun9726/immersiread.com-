/**
 * BilingualAlignment.ts
 * 
 * 🎯 双语对齐映射
 * 
 * 核心思想：
 * 双语不是"两次朗读"，而是"一次朗读 + 两张映射表"
 * - 朗读只认 Original charOffset
 * - 译文只负责被动映射高亮
 * 
 * ❌ 不做词对词、字对字
 * ✅ 按段落/句组对齐（足够稳定）
 */

export interface CharRange {
    start: number;
    end: number;
}

export interface Alignment {
    original: CharRange;
    translated: CharRange;
}

/**
 * 双语对齐管理器
 */
class BilingualAlignmentClass {
    private alignmentMap: Alignment[] = [];
    private translatedCharMap: CharRange[] = [];
    private isEnabled = false;

    /**
     * 设置对齐映射
     * 
     * @param alignments - 原文 → 译文的段落级对齐
     */
    setAlignmentMap(alignments: Alignment[]): void {
        this.alignmentMap = alignments;
        console.log('[BilingualAlignment] Set alignment map:', alignments.length, 'entries');
    }

    /**
     * 从段落数据构建对齐映射
     * 
     * @param originalParagraphs - 原文段落列表
     * @param translatedParagraphs - 译文段落列表
     */
    buildFromParagraphs(
        originalParagraphs: Array<{ startOffset: number; endOffset: number }>,
        translatedParagraphs: Array<{ startOffset: number; endOffset: number }>
    ): void {
        // 确保两边段落数量一致
        const count = Math.min(originalParagraphs.length, translatedParagraphs.length);

        this.alignmentMap = [];
        for (let i = 0; i < count; i++) {
            this.alignmentMap.push({
                original: {
                    start: originalParagraphs[i].startOffset,
                    end: originalParagraphs[i].endOffset,
                },
                translated: {
                    start: translatedParagraphs[i].startOffset,
                    end: translatedParagraphs[i].endOffset,
                },
            });
        }

        console.log('[BilingualAlignment] Built alignment from paragraphs:', count, 'entries');
    }

    /**
     * 从 DOM 构建对齐映射
     * 
     * @param doc - 文档
     */
    buildFromDOM(doc: Document): void {
        const originalBlocks: Array<{ startOffset: number; endOffset: number }> = [];
        const translatedBlocks: Array<{ startOffset: number; endOffset: number }> = [];

        let originalOffset = 0;
        let translatedOffset = 0;

        // 查找所有带原文/译文标记的块
        const blocks = doc.querySelectorAll('[data-block-id]');

        blocks.forEach((block) => {
            const el = block as HTMLElement;
            const blockId = el.dataset?.blockId || '';
            const text = this.sanitizeText(el.textContent || '');

            if (!text) return;

            // 判断是原文还是译文
            const isTranslation = el.classList.contains('translation') ||
                el.dataset?.type === 'translation' ||
                blockId.includes('translation');

            if (isTranslation) {
                translatedBlocks.push({
                    startOffset: translatedOffset,
                    endOffset: translatedOffset + text.length,
                });
                translatedOffset += text.length + 1;
            } else {
                originalBlocks.push({
                    startOffset: originalOffset,
                    endOffset: originalOffset + text.length,
                });
                originalOffset += text.length + 1;
            }
        });

        this.buildFromParagraphs(originalBlocks, translatedBlocks);
    }

    /**
     * 启用双语模式
     */
    enable(): void {
        this.isEnabled = true;
        console.log('[BilingualAlignment] Enabled');
    }

    /**
     * 禁用双语模式
     */
    disable(): void {
        this.isEnabled = false;
        console.log('[BilingualAlignment] Disabled');
    }

    /**
     * 检查是否启用
     */
    isActive(): boolean {
        return this.isEnabled && this.alignmentMap.length > 0;
    }

    /**
     * 查找包含给定 offset 的对齐条目
     */
    findAlignment(originalOffset: number): Alignment | null {
        return this.alignmentMap.find(
            (a) => originalOffset >= a.original.start && originalOffset < a.original.end
        ) ?? null;
    }

    /**
     * 计算段内进度（关键算法）
     */
    calcProgress(alignment: Alignment, originalOffset: number): number {
        const range = alignment.original.end - alignment.original.start;
        if (range <= 0) return 0;
        return (originalOffset - alignment.original.start) / range;
    }

    /**
     * 映射到译文 offset
     */
    mapToTranslatedOffset(alignment: Alignment, progress: number): number {
        const range = alignment.translated.end - alignment.translated.start;
        return alignment.translated.start + progress * range;
    }

    /**
     * 一步完成：原文 offset → 译文 offset
     */
    getTranslatedOffset(originalOffset: number): number | null {
        if (!this.isEnabled) return null;

        const alignment = this.findAlignment(originalOffset);
        if (!alignment) return null;

        const progress = this.calcProgress(alignment, originalOffset);
        return this.mapToTranslatedOffset(alignment, progress);
    }

    /**
     * 清洗文本
     */
    private sanitizeText(text: string): string {
        return text
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    /**
     * 清除所有数据
     */
    clear(): void {
        this.alignmentMap = [];
        this.translatedCharMap = [];
        this.isEnabled = false;
    }
}

// 单例导出
export const bilingualAlignment = new BilingualAlignmentClass();
