/**
 * SentenceRegistry.ts
 * 
 * 🚨 重要：只服务「当前朗读会话」
 * 
 * 核心原则：
 * ❌ 点击事件 禁止 调用 SentenceRegistry
 * ❌ SentenceRegistry 禁止 跨朗读会话复用
 * ✅ 每一次点击朗读 = 新朗读会话
 * 
 * SentenceRegistry 不负责：
 * - 查点击 sentenceId（使用 SentenceIndex）
 * - 跨页句子
 * - 全书索引
 */

export interface Sentence {
    id: string;           // 全局唯一
    text: string;         // 朗读用文本（已清洗）
    start: number;        // 在 utterance.text 中的 char 起点
    end: number;          // 在 utterance.text 中的 char 终点
    node?: HTMLElement;   // 对应的 DOM 节点（用于高亮）
}

/**
 * 句子注册表 - 只管理「当前 utterance 的句子」
 */
class SentenceRegistryClass {
    private sentences: Sentence[] = [];
    private sentenceMap: Map<string, Sentence> = new Map();

    /**
     * 🆕 重置注册表（每次新朗读会话必须调用）
     * 这是唯一应该用来初始化句子的方法
     */
    reset(sentences: Sentence[]): void {
        this.sentences = sentences;
        this.sentenceMap.clear();
        sentences.forEach(s => this.sentenceMap.set(s.id, s));
        console.log('[SentenceRegistry] RESET with', sentences.length, 'sentences');
    }

    /**
     * 清空注册表
     */
    clear(): void {
        this.sentences = [];
        this.sentenceMap.clear();
    }

    /**
     * 获取所有句子（当前会话）
     */
    getAll(): Sentence[] {
        return this.sentences;
    }

    /**
     * 根据 ID 获取句子（当前会话内）
     */
    getById(id: string): Sentence | null {
        return this.sentenceMap.get(id) || null;
    }

    /**
     * 根据 charIndex 查找句子（用于 onboundary 高亮）
     * 这是 SentenceRegistry 的核心职责
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
     * 检查是否为空
     */
    isEmpty(): boolean {
        return this.sentences.length === 0;
    }
}

// 单例导出
export const sentenceRegistry = new SentenceRegistryClass();
