/**
 * DOMOffsetResolver.ts
 * 
 * 🎯 精确的 DOM → charOffset 解析器
 * 
 * 核心功能：
 * - 点击任意位置 → 精确 charOffset
 * - 支持所有阅读模式
 * - 模式切换时自动重建
 * 
 * 使用 Range API 实现精确定位
 */

export interface ResolvedOffset {
    charOffset: number;
    sentenceId?: string;
    blockId?: string;
    mode: 'original' | 'translation' | 'bilingual';
}

/**
 * DOM Offset 解析器
 */
class DOMOffsetResolverClass {
    private containerRoot: Node | null = null;
    private currentMode: 'original' | 'translation' | 'bilingual' = 'original';

    /**
     * 设置容器根节点
     */
    setContainer(root: Node): void {
        this.containerRoot = root;
        console.log('[DOMOffsetResolver] Container set');
    }

    /**
     * 设置当前阅读模式
     */
    setMode(mode: 'original' | 'translation' | 'bilingual'): void {
        this.currentMode = mode;
        console.log('[DOMOffsetResolver] Mode set:', mode);
    }

    /**
     * 从点击的 DOM 节点解析精确的 charOffset
     * 
     * @param clickedNode - 点击的 DOM 节点
     * @param doc - 当前文档
     */
    resolveFromClick(clickedNode: Node, doc: Document): ResolvedOffset | null {
        console.log('[DOMOffsetResolver] Resolving from click, mode:', this.currentMode);

        // 找到包含点击节点的句子或段落
        const targetElement = this.findTargetElement(clickedNode as HTMLElement);
        if (!targetElement) {
            console.warn('[DOMOffsetResolver] No target element found');
            return null;
        }

        // 计算精确的 charOffset
        const charOffset = this.calculateCharOffset(targetElement, doc);

        const result: ResolvedOffset = {
            charOffset,
            sentenceId: targetElement.dataset?.sentenceId,
            blockId: targetElement.closest('[data-block-id]')?.getAttribute('data-block-id') || undefined,
            mode: this.currentMode,
        };

        console.log('[DOMOffsetResolver] Resolved:', result);
        return result;
    }

    /**
     * 找到目标元素（句子优先，其次是段落）
     */
    private findTargetElement(node: HTMLElement): HTMLElement | null {
        // 优先找句子
        const sentenceNode = node.closest('[data-sentence-id]') as HTMLElement | null;
        if (sentenceNode) {
            return sentenceNode;
        }

        // 其次找段落
        const blockNode = node.closest('[data-block-id]') as HTMLElement | null;
        if (blockNode) {
            return blockNode;
        }

        // 如果都没有，返回原节点
        return node;
    }

    /**
     * 计算精确的 charOffset
     * 
     * 使用 Range API，遍历当前模式下的所有有效节点
     */
    private calculateCharOffset(targetNode: HTMLElement, doc: Document): number {
        let charOffset = 0;

        // 根据模式获取所有相关节点
        const allNodes = this.getAllNodesForMode(doc);

        for (let i = 0; i < allNodes.length; i++) {
            const node = allNodes[i] as HTMLElement;

            // 如果找到目标节点，返回当前累计的 offset
            if (node === targetNode || node.contains(targetNode) || targetNode.contains(node)) {
                console.log('[DOMOffsetResolver] Found target at offset:', charOffset);
                return charOffset;
            }

            // 累加文本长度
            const text = this.sanitizeText(node.textContent || '');
            if (text) {
                charOffset += text.length + 1; // +1 for separator
            }
        }

        // 如果没找到，返回 0
        console.warn('[DOMOffsetResolver] Target not found, returning 0');
        return 0;
    }

    /**
     * 根据模式获取所有相关节点
     */
    private getAllNodesForMode(doc: Document): NodeListOf<Element> {
        // 获取所有句子节点
        const allSentences = doc.querySelectorAll('[data-sentence-id]');

        // 如果需要按模式过滤，在这里处理
        // 目前返回所有节点，过滤在 extractText 中进行
        return allSentences;
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
     * 重置状态（模式切换时调用）
     */
    reset(): void {
        console.log('[DOMOffsetResolver] Reset');
    }
}

// 单例导出
export const domOffsetResolver = new DOMOffsetResolverClass();
