/**
 * ReadingEntryResolver.ts
 * 
 * 🛡️ 止血层 - 所有朗读入口必须先过 Resolver
 * 
 * 核心原则：
 * ❌ 禁止任何地方直接写 globalReadingCursor.charOffset
 * ✅ 所有入口必须先过 Resolver
 * 
 * 支持的入口类型：
 * - cfi: EPUB CFI 定位
 * - block: blockId 定位
 * - paragraph: paragraphId 定位  
 * - sentence: sentenceId 定位
 * - offset: 直接 charOffset（仅限内部使用）
 * - fallback: 降级到 0
 */

export type ReadingEntry =
    | { type: "cfi"; cfi: string }
    | { type: "block"; blockId: string }
    | { type: "paragraph"; paragraphId: string }
    | { type: "sentence"; sentenceId: string }
    | { type: "offset"; charOffset: number }
    | { type: "fallback" };

export interface ResolveResult {
    charOffset: number;
    spineIndex?: number;
    cfi?: string;
    source: ReadingEntry["type"];
}

/**
 * 全书级句子索引接口
 */
export interface SentenceIndexInterface {
    resolveCharOffset(sentenceId: string): number | null;
}

/**
 * 全书级 Block 索引接口
 */
export interface BlockIndexInterface {
    resolveBlockOffset(blockId: string): number | null;
    resolveParagraphOffset(paragraphId: string): number | null;
}

/**
 * CFI 索引接口
 */
export interface CFIIndexInterface {
    resolve(cfi: string): { charOffset: number; spineIndex?: number } | null;
}

/**
 * ReadingEntryResolver - 朗读入口解析器
 * 
 * 所有朗读操作必须通过这个解析器
 */
class ReadingEntryResolverClass {
    private sentenceIndex: SentenceIndexInterface | null = null;
    private blockIndex: BlockIndexInterface | null = null;
    private cfiIndex: CFIIndexInterface | null = null;

    // 当前页面的 DOM 文档
    private currentDoc: Document | null = null;

    /**
     * 配置索引
     */
    configure(options: {
        sentenceIndex?: SentenceIndexInterface;
        blockIndex?: BlockIndexInterface;
        cfiIndex?: CFIIndexInterface;
    }): void {
        if (options.sentenceIndex) this.sentenceIndex = options.sentenceIndex;
        if (options.blockIndex) this.blockIndex = options.blockIndex;
        if (options.cfiIndex) this.cfiIndex = options.cfiIndex;
    }

    /**
     * 设置当前文档（用于 DOM 查询）
     */
    setDocument(doc: Document): void {
        this.currentDoc = doc;
    }

    /**
     * 解析入口 → charOffset
     * 
     * 这是唯一的出口，所有朗读操作必须调用这个方法
     */
    resolve(entry: ReadingEntry): ResolveResult | null {
        console.log('[ReadingEntryResolver] Resolving:', entry);

        switch (entry.type) {
            case "sentence": {
                // 优先尝试从全书索引查询
                if (this.sentenceIndex) {
                    const offset = this.sentenceIndex.resolveCharOffset(entry.sentenceId);
                    if (offset !== null) {
                        console.log('[ReadingEntryResolver] Resolved sentence from index:', offset);
                        return { charOffset: offset, source: "sentence" };
                    }
                }

                // 降级：从当前 DOM 计算
                const offset = this.resolveFromDOM(entry.sentenceId);
                if (offset !== null) {
                    console.log('[ReadingEntryResolver] Resolved sentence from DOM:', offset);
                    return { charOffset: offset, source: "sentence" };
                }

                console.warn('[ReadingEntryResolver] Failed to resolve sentence:', entry.sentenceId);
                return null;
            }

            case "paragraph": {
                // 优先尝试从全书索引查询
                if (this.blockIndex) {
                    const offset = this.blockIndex.resolveParagraphOffset(entry.paragraphId);
                    if (offset !== null) {
                        console.log('[ReadingEntryResolver] Resolved paragraph from index:', offset);
                        return { charOffset: offset, source: "paragraph" };
                    }
                }

                // 降级：从当前 DOM 查找段落
                const offset = this.resolveParagraphFromDOM(entry.paragraphId);
                if (offset !== null) {
                    console.log('[ReadingEntryResolver] Resolved paragraph from DOM:', offset);
                    return { charOffset: offset, source: "paragraph" };
                }

                console.warn('[ReadingEntryResolver] Failed to resolve paragraph:', entry.paragraphId);
                return null;
            }

            case "block": {
                if (this.blockIndex) {
                    const offset = this.blockIndex.resolveBlockOffset(entry.blockId);
                    if (offset !== null) {
                        console.log('[ReadingEntryResolver] Resolved block from index:', offset);
                        return { charOffset: offset, source: "block" };
                    }
                }

                // 降级：从当前 DOM 查找 block
                const offset = this.resolveBlockFromDOM(entry.blockId);
                if (offset !== null) {
                    console.log('[ReadingEntryResolver] Resolved block from DOM:', offset);
                    return { charOffset: offset, source: "block" };
                }

                console.warn('[ReadingEntryResolver] Failed to resolve block:', entry.blockId);
                return null;
            }

            case "cfi": {
                if (this.cfiIndex) {
                    const res = this.cfiIndex.resolve(entry.cfi);
                    if (res) {
                        console.log('[ReadingEntryResolver] Resolved CFI:', res);
                        return {
                            charOffset: res.charOffset,
                            spineIndex: res.spineIndex,
                            cfi: entry.cfi,
                            source: "cfi"
                        };
                    }
                }

                // CFI 解析失败，降级到页面开头
                console.warn('[ReadingEntryResolver] Failed to resolve CFI:', entry.cfi);
                return { charOffset: 0, cfi: entry.cfi, source: "cfi" };
            }

            case "offset": {
                // 直接使用 offset（仅限内部使用）
                return { charOffset: entry.charOffset, source: "offset" };
            }

            case "fallback": {
                console.log('[ReadingEntryResolver] Using fallback (offset 0)');
                return { charOffset: 0, source: "fallback" };
            }

            default: {
                console.warn('[ReadingEntryResolver] Unknown entry type');
                return null;
            }
        }
    }

    /**
     * 从当前 DOM 解析 sentenceId 的 charOffset
     */
    private resolveFromDOM(sentenceId: string): number | null {
        if (!this.currentDoc) return null;

        let charOffset = 0;
        const allSentenceNodes = this.currentDoc.querySelectorAll('[data-sentence-id]');

        for (let i = 0; i < allSentenceNodes.length; i++) {
            const node = allSentenceNodes[i] as HTMLElement;
            const id = node.dataset?.sentenceId;

            if (id === sentenceId) {
                return charOffset;
            }

            // 累加文本长度
            const text = this.sanitizeText(node.textContent || '');
            if (text) {
                charOffset += text.length + 1; // +1 for space
            }
        }

        return null;
    }

    /**
     * 从当前 DOM 解析 paragraphId 的 charOffset
     */
    private resolveParagraphFromDOM(paragraphId: string): number | null {
        if (!this.currentDoc) return null;

        let charOffset = 0;
        const allBlocks = this.currentDoc.querySelectorAll('[data-block-id]');

        for (let i = 0; i < allBlocks.length; i++) {
            const block = allBlocks[i] as HTMLElement;
            const blockId = block.dataset?.blockId;

            // 找到目标段落
            if (blockId === paragraphId) {
                return charOffset;
            }

            // 累加 block 内所有句子的文本长度
            const sentences = block.querySelectorAll('[data-sentence-id]');
            sentences.forEach(node => {
                const text = this.sanitizeText(node.textContent || '');
                if (text) {
                    charOffset += text.length + 1;
                }
            });
        }

        return null;
    }

    /**
     * 从当前 DOM 解析 blockId 的 charOffset
     */
    private resolveBlockFromDOM(blockId: string): number | null {
        // 与 paragraph 逻辑相同
        return this.resolveParagraphFromDOM(blockId);
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
