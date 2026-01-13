/**
 * ReadingEntryResolver.ts
 * 
 * 🛡️ 止血层 - 只接受「索引期稳定入口」
 * 
 * ✅ 唯一合法入口（三选一）：
 * - { type: 'charOffset', offset: number }
 * - { type: 'cfi', cfi: string }
 * - { type: 'block', blockId: string }
 * 
 * ❌ 禁止的入口：
 * - sentenceId（尤其是 fallback-* 这种动态生成的）
 * - paragraph（映射不稳定）
 */

export type ReadingEntry =
    | { type: 'charOffset'; offset: number }
    | { type: 'cfi'; cfi: string }
    | { type: 'block'; blockId: string };

export interface ResolvedReadingEntry {
    charOffset: number;
    spineIndex: number;
    cfi?: string;
}

/**
 * 全书索引接口
 */
export interface BookIndex {
    cfiToOffset: (cfi: string) => number | null;
    blockToOffset: (blockId: string) => number | null;
    clampOffset: (offset: number) => number;
}

/**
 * ReadingEntryResolver - 朗读入口解析器
 * 
 * 只接受稳定的入口类型，禁止 sentenceId
 */
class ReadingEntryResolverClass {
    private bookIndex: BookIndex | null = null;
    private currentDoc: Document | null = null;

    /**
     * 配置全书索引
     */
    configure(bookIndex: BookIndex): void {
        this.bookIndex = bookIndex;
    }

    /**
     * 设置当前文档（用于 DOM 查询）
     */
    setDocument(doc: Document): void {
        this.currentDoc = doc;
    }

    /**
     * 解析入口 → ResolvedReadingEntry
     * 
     * 只接受 charOffset / cfi / block
     */
    resolve(entry: ReadingEntry): ResolvedReadingEntry | null {
        let offset: number | null = null;

        switch (entry.type) {
            case 'charOffset':
                offset = entry.offset;
                console.log('[ReadingEntryResolver] charOffset entry:', offset);
                break;

            case 'cfi':
                if (this.bookIndex) {
                    offset = this.bookIndex.cfiToOffset(entry.cfi);
                }
                if (offset === null) {
                    // CFI 解析失败，降级到 0
                    console.warn('[ReadingEntryResolver] CFI resolve failed, fallback to 0:', entry.cfi);
                    offset = 0;
                }
                console.log('[ReadingEntryResolver] cfi entry:', entry.cfi, '→', offset);
                break;

            case 'block':
                if (this.bookIndex) {
                    offset = this.bookIndex.blockToOffset(entry.blockId);
                }
                if (offset === null) {
                    // 尝试从 DOM 解析
                    offset = this.resolveBlockFromDOM(entry.blockId);
                }
                if (offset === null) {
                    console.warn('[ReadingEntryResolver] Block resolve failed:', entry.blockId);
                    return null;
                }
                console.log('[ReadingEntryResolver] block entry:', entry.blockId, '→', offset);
                break;

            default:
                console.error('[ReadingEntryResolver] Unknown entry type:', entry);
                return null;
        }

        if (offset === null || offset < 0) {
            console.warn('[ReadingEntryResolver] Invalid offset:', offset);
            return null;
        }

        // Clamp offset
        if (this.bookIndex) {
            offset = this.bookIndex.clampOffset(offset);
        }

        return {
            charOffset: offset,
            spineIndex: this.resolveSpineIndex(offset),
            cfi: entry.type === 'cfi' ? entry.cfi : undefined
        };
    }

    /**
     * 从 DOM 解析 blockId 的 charOffset
     */
    private resolveBlockFromDOM(blockId: string): number | null {
        if (!this.currentDoc) return null;

        let charOffset = 0;
        const allBlocks = this.currentDoc.querySelectorAll('[data-block-id]');

        for (let i = 0; i < allBlocks.length; i++) {
            const block = allBlocks[i] as HTMLElement;
            const id = block.dataset?.blockId;

            if (id === blockId) {
                return charOffset;
            }

            // 累加 block 内所有文本的长度
            const text = this.sanitizeText(block.textContent || '');
            if (text) {
                charOffset += text.length + 1;
            }
        }

        return null;
    }

    /**
     * 解析 spineIndex（暂时返回 0，后续可以扩展）
     */
    private resolveSpineIndex(offset: number): number {
        // TODO: 根据 offset 计算 spineIndex
        return 0;
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
}

// 单例导出
export const readingEntryResolver = new ReadingEntryResolverClass();
