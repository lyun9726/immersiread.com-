/**
 * SentenceIndex.ts
 * 
 * 全书级句子索引 - 用于点击事件定位
 * 
 * 核心原则：
 * - 点击事件只负责定位，不参与朗读
 * - 点击事件禁止直接用 sentenceId 查询 SentenceRegistry
 * - sentenceIndex 是全书级索引，不等于 SentenceRegistry
 */

export interface SentenceIndexEntry {
    sentenceId: string;     // 全局唯一 ID
    charOffset: number;     // 在页面文本中的字符偏移
    pageIndex?: number;     // 所在页面
    cfi?: string;           // EPUB CFI（可选）
}

/**
 * 全书级句子索引
 * 用于点击定位，不用于朗读
 */
class SentenceIndexClass {
    private entries: Map<string, SentenceIndexEntry> = new Map();
    private nodeMap: Map<string, HTMLElement> = new Map();

    /**
     * 注册句子的位置信息
     */
    register(sentenceId: string, node: HTMLElement, charOffset: number = 0): void {
        this.entries.set(sentenceId, {
            sentenceId,
            charOffset,
        });
        this.nodeMap.set(sentenceId, node);
    }

    /**
     * 批量注册（从 DOM 提取）
     */
    registerFromDOM(doc: Document): void {
        this.entries.clear();
        this.nodeMap.clear();

        let offset = 0;
        const sentenceNodes = doc.querySelectorAll<HTMLElement>('[data-sentence-id]');

        sentenceNodes.forEach(node => {
            const id = node.dataset.sentenceId;
            if (!id) return;

            const text = this.extractText(node);
            if (!text) return;

            this.entries.set(id, {
                sentenceId: id,
                charOffset: offset,
            });
            this.nodeMap.set(id, node);

            offset += text.length + 1; // +1 for space
        });

        console.log('[SentenceIndex] Registered', this.entries.size, 'sentences');
    }

    /**
     * 点击时解析 charOffset
     * 这是点击事件唯一应该调用的方法
     */
    resolveCharOffset(sentenceId: string): number | null {
        const entry = this.entries.get(sentenceId);
        return entry?.charOffset ?? null;
    }

    /**
     * 获取句子对应的 DOM 节点
     */
    getNode(sentenceId: string): HTMLElement | null {
        return this.nodeMap.get(sentenceId) || null;
    }

    /**
     * 清空索引
     */
    clear(): void {
        this.entries.clear();
        this.nodeMap.clear();
    }

    /**
     * 从节点提取文本
     */
    private extractText(node: HTMLElement): string {
        const clone = node.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('script, style').forEach(el => el.remove());
        return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }
}

// 单例导出
export const sentenceIndex = new SentenceIndexClass();
