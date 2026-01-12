/**
 * SpeakTargetResolver.ts
 * 
 * 核心职责：把"用户点击的任意位置" → 解析成一个「可朗读的最小 Speak Target」
 * 
 * ✅ 点哪里都能立刻读
 * ✅ 不依赖旧的 segment 复用（跨页必炸的问题源头）
 * ✅ 翻译 / 原文 / bilingual 都能用
 * ✅ 自动翻页、朗读不中断
 * 
 * 约定的 DOM 结构：
 * <p data-block-id="p-12">
 *   <span data-sentence-id="s-12-1">This is the first sentence.</span>
 *   <span data-sentence-id="s-12-2">This is the second sentence.</span>
 * </p>
 */

export type SpeakTarget = {
    blockId: string
    sentenceId: string
    node: HTMLElement
    text: string  // 已清洗的可朗读文本
}

export class SpeakTargetResolver {
    /**
     * 从点击事件解析出可朗读目标
     */
    static resolveFromEvent(e: MouseEvent | Event): SpeakTarget | null {
        const target = e.target as HTMLElement | null
        if (!target) return null

        return this.resolveFromNode(target)
    }

    /**
     * 从任意 DOM 节点解析出可朗读目标
     */
    static resolveFromNode(node: HTMLElement | null): SpeakTarget | null {
        if (!node) return null

        // 1️⃣ 优先向上找 sentence
        const sentenceNode = node.closest<HTMLElement>('[data-sentence-id]')
        if (sentenceNode) {
            return this.buildTarget(sentenceNode)
        }

        // 2️⃣ 再找 block（用户点在空白处）
        const blockNode = node.closest<HTMLElement>('[data-block-id]')
        if (blockNode) {
            const firstSentence = blockNode.querySelector<HTMLElement>('[data-sentence-id]')
            if (firstSentence) {
                return this.buildTarget(firstSentence)
            }
            // 如果 block 内没有 sentence 标记，尝试使用整个 block
            return this.buildBlockAsTarget(blockNode)
        }

        // 3️⃣ 兜底：尝试用点击的元素本身
        return this.buildFallbackTarget(node)
    }

    /**
     * 获取下一个可朗读目标（用于自动连续朗读）
     */
    static getNextTarget(current: SpeakTarget, doc: Document): SpeakTarget | null {
        // 找当前 sentence 的下一个
        const allSentences = Array.from(doc.querySelectorAll<HTMLElement>('[data-sentence-id]'))
        const currentIndex = allSentences.findIndex(s => s.dataset.sentenceId === current.sentenceId)

        if (currentIndex >= 0 && currentIndex < allSentences.length - 1) {
            return this.buildTarget(allSentences[currentIndex + 1])
        }

        // 没有下一个 sentence 了 → 需要翻页
        return null
    }

    /**
     * 获取页面第一个可朗读目标
     */
    static getFirstTarget(doc: Document): SpeakTarget | null {
        const firstSentence = doc.querySelector<HTMLElement>('[data-sentence-id]')
        if (firstSentence) {
            return this.buildTarget(firstSentence)
        }

        // 没有 sentence 标记，尝试找第一个 block
        const firstBlock = doc.querySelector<HTMLElement>('[data-block-id]')
        if (firstBlock) {
            return this.buildBlockAsTarget(firstBlock)
        }

        // 什么都没有，尝试从 body 提取文本
        return this.buildRootTarget(doc)
    }

    private static buildTarget(sentenceNode: HTMLElement): SpeakTarget | null {
        const sentenceId = sentenceNode.dataset.sentenceId
        if (!sentenceId) return null

        const blockNode = sentenceNode.closest<HTMLElement>('[data-block-id]')
        const blockId = blockNode?.dataset.blockId || `auto-${sentenceId}`

        const text = this.extractSpeakableText(sentenceNode)
        if (!text) return null

        return {
            blockId,
            sentenceId,
            node: sentenceNode,
            text,
        }
    }

    private static buildBlockAsTarget(blockNode: HTMLElement): SpeakTarget | null {
        const blockId = blockNode.dataset.blockId
        if (!blockId) return null

        const text = this.extractSpeakableText(blockNode)
        if (!text) return null

        return {
            blockId,
            sentenceId: `${blockId}-full`,
            node: blockNode,
            text,
        }
    }

    private static buildFallbackTarget(node: HTMLElement): SpeakTarget | null {
        const text = this.extractSpeakableText(node)
        if (!text) return null

        const id = `fallback-${Date.now()}`
        return {
            blockId: id,
            sentenceId: id,
            node,
            text,
        }
    }

    private static buildRootTarget(doc: Document): SpeakTarget | null {
        const body = doc.body
        if (!body) return null

        const text = this.extractSpeakableText(body)
        if (!text) return null

        return {
            blockId: 'root',
            sentenceId: 'root',
            node: body as HTMLElement,
            text,
        }
    }

    /**
     * 从节点提取可朗读文本
     * 核心原则：过滤掉 script/style，清洗零宽字符
     */
    private static extractSpeakableText(node: HTMLElement): string | null {
        if (!node) return null

        // 克隆节点以避免修改原 DOM
        const clone = node.cloneNode(true) as HTMLElement

        // 移除 script/style
        clone.querySelectorAll('script, style').forEach(el => el.remove())

        // 提取文本
        let text = clone.textContent || ''

        // 清洗
        text = this.sanitize(text)

        // 验证
        if (!this.isValid(text)) return null

        return text
    }

    private static sanitize(text: string): string {
        return text
            .replace(/\s+/g, ' ')                    // 多空格合并
            .replace(/[\u200B-\u200D\uFEFF]/g, '')   // 零宽字符
            .replace(/\n+/g, ' ')                    // 换行合并
            .trim()
    }

    private static isValid(text: string): boolean {
        if (!text) return false
        if (text.length < 2) return false
        if (text === '...' || text === '…') return false
        if (text.includes('正在翻译') || text.includes('translating')) return false
        return true
    }
}
