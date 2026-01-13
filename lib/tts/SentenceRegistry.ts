/**
 * SentenceRegistry.ts
 * 
 * 唯一 Sentence Source（核心）
 * 
 * 系统中所有东西都只能引用 sentence.id：
 * - 原文
 * - 翻译
 * - 高亮
 * - 翻页
 * - 点击朗读起点
 * 
 * ❌ 禁止使用 DOM index / span index / child index
 */

export interface Sentence {
    id: string;           // 全局唯一
    text: string;         // 朗读用文本（已清洗）
    start: number;        // 在 utterance.text 中的 char 起点
    end: number;          // 在 utterance.text 中的 char 终点
    node?: HTMLElement;   // 对应的 DOM 节点（用于高亮）
}

/**
 * 句子注册表 - 管理当前页面的所有句子
 */
class SentenceRegistryClass {
    private sentences: Sentence[] = [];
    private sentenceMap: Map<string, Sentence> = new Map();

    /**
     * 清空并重新注册当前页面的句子
     */
    register(sentences: Sentence[]): void {
        this.sentences = sentences;
        this.sentenceMap.clear();
        sentences.forEach(s => this.sentenceMap.set(s.id, s));
        console.log('[SentenceRegistry] Registered', sentences.length, 'sentences');
    }

    /**
     * 清空注册表
     */
    clear(): void {
        this.sentences = [];
        this.sentenceMap.clear();
    }

    /**
     * 获取所有句子
     */
    getAll(): Sentence[] {
        return this.sentences;
    }

    /**
     * 从指定句子开始获取所有句子（用于朗读）
     */
    getFrom(sentenceId: string): Sentence[] {
        const index = this.sentences.findIndex(s => s.id === sentenceId);
        if (index === -1) {
            console.warn('[SentenceRegistry] Sentence not found:', sentenceId);
            return this.sentences; // Fallback: 返回所有句子
        }
        return this.sentences.slice(index);
    }

    /**
     * 根据 ID 获取句子
     */
    getById(id: string): Sentence | null {
        return this.sentenceMap.get(id) || null;
    }

    /**
     * 根据 charIndex 查找句子（用于 onboundary 高亮）
     * ⚠️ 不要做二分优化，句子数量 < 300，for loop 更稳定
     */
    findByCharIndex(charIndex: number): Sentence | null {
        for (const s of this.sentences) {
            if (charIndex >= s.start && charIndex < s.end) {
                return s;
            }
        }
        return null;
    }

    /**
     * 获取第一个句子
     */
    getFirst(): Sentence | null {
        return this.sentences[0] || null;
    }

    /**
     * 获取下一个句子
     */
    getNext(currentId: string): Sentence | null {
        const index = this.sentences.findIndex(s => s.id === currentId);
        if (index === -1 || index >= this.sentences.length - 1) {
            return null;
        }
        return this.sentences[index + 1];
    }

    /**
     * 获取上一个句子
     */
    getPrev(currentId: string): Sentence | null {
        const index = this.sentences.findIndex(s => s.id === currentId);
        if (index <= 0) {
            return null;
        }
        return this.sentences[index - 1];
    }

    /**
     * 检查是否为空
     */
    isEmpty(): boolean {
        return this.sentences.length === 0;
    }

    /**
     * 从 DOM 提取并注册句子
     */
    extractAndRegister(doc: Document): string {
        const sentences: Sentence[] = [];
        let currentStart = 0;
        let fullText = '';

        // 查找所有带 data-sentence-id 的元素
        const sentenceNodes = doc.querySelectorAll<HTMLElement>('[data-sentence-id]');

        sentenceNodes.forEach(node => {
            const id = node.dataset.sentenceId;
            if (!id) return;

            const text = this.extractText(node);
            if (!text) return;

            const cleanText = this.sanitize(text);
            if (!cleanText) return;

            sentences.push({
                id,
                text: cleanText,
                start: currentStart,
                end: currentStart + cleanText.length,
                node,
            });

            fullText += cleanText + ' ';
            currentStart += cleanText.length + 1; // +1 for space
        });

        this.register(sentences);
        return fullText.trim();
    }

    /**
     * 从节点提取文本（排除 script/style）
     */
    private extractText(node: HTMLElement): string {
        const clone = node.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('script, style').forEach(el => el.remove());
        return clone.textContent || '';
    }

    /**
     * 清洗文本
     */
    private sanitize(text: string): string {
        return text
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }
}

// 单例导出
export const sentenceRegistry = new SentenceRegistryClass();
