/**
 * startReadingFrom.ts
 * 
 * 🎯 统一朗读入口 - 所有朗读操作的唯一入口点
 * 
 * ✅ 正确用法：
 * startReadingFrom({ type: 'charOffset', offset: 123 })
 * startReadingFrom({ type: 'cfi', cfi: 'xxx' })
 * startReadingFrom({ type: 'block', blockId: 'xxx' })
 * 
 * ❌ 禁止用法：
 * startReadingFrom({ type: 'sentence', sentenceId: 'xxx' })  // 禁止！
 * globalReadingCursor.setPosition(xxx)  // 禁止！
 */

import { readingEntryResolver, type ReadingEntry, type ResolvedReadingEntry } from './ReadingEntryResolver';
import { globalReadingCursor } from './GlobalReadingCursor';

// Re-export types
export type { ReadingEntry, ResolvedReadingEntry } from './ReadingEntryResolver';

export interface StartReadingOptions {
    onStart?: () => void;
    onResolveFailed?: (entry: ReadingEntry) => void;
}

// 朗读启动回调（由 useEpubTTS 注册）
let speakStartCallback: ((offset: number) => void) | null = null;

/**
 * 注册朗读启动回调
 */
export function registerSpeakStartCallback(callback: (offset: number) => void): () => void {
    speakStartCallback = callback;
    return () => {
        speakStartCallback = null;
    };
}

/**
 * 统一朗读入口
 * 
 * 只接受 charOffset / cfi / block
 */
export function startReadingFrom(entry: ReadingEntry, options: StartReadingOptions = {}): boolean {
    console.log('[startReadingFrom] Entry:', entry);

    // 通过 Resolver 解析
    const resolved = readingEntryResolver.resolve(entry);

    if (!resolved) {
        console.warn('[startReadingFrom] Resolve failed:', entry);
        options.onResolveFailed?.(entry);
        return false;
    }

    console.log('[startReadingFrom] Resolved:', resolved);

    // 更新全局游标
    globalReadingCursor.setPosition(
        resolved.charOffset,
        resolved.spineIndex,
        resolved.cfi
    );

    // 触发朗读
    if (speakStartCallback) {
        speakStartCallback(resolved.charOffset);
        options.onStart?.();
        return true;
    } else {
        console.warn('[startReadingFrom] No speak callback registered');
        return false;
    }
}

/**
 * 从点击事件开始朗读
 * 
 * ✅ 优先使用 block（最稳定）
 */
export function startReadingFromClick(target: HTMLElement, doc?: Document): boolean {
    // 优先检测 block
    const blockNode = target.closest('[data-block-id]') as HTMLElement | null;
    if (blockNode?.dataset?.blockId) {
        return startReadingFrom({
            type: 'block',
            blockId: blockNode.dataset.blockId
        });
    }

    // 如果没有 block，计算 charOffset
    if (doc) {
        const offset = calculateCharOffsetFromNode(target, doc);
        if (offset !== null) {
            return startReadingFrom({
                type: 'charOffset',
                offset
            });
        }
    }

    // 降级到 0
    console.warn('[startReadingFromClick] No valid target, fallback to offset 0');
    return startReadingFrom({ type: 'charOffset', offset: 0 });
}

/**
 * 从 CFI 开始朗读
 */
export function startReadingFromCFI(cfi: string): boolean {
    return startReadingFrom({ type: 'cfi', cfi });
}

/**
 * 从 charOffset 开始朗读
 */
export function startReadingFromOffset(offset: number): boolean {
    return startReadingFrom({ type: 'charOffset', offset });
}

/**
 * 从当前位置继续朗读
 */
export function resumeReading(): boolean {
    const state = globalReadingCursor.getState();

    if (state.cfi) {
        return startReadingFrom({ type: 'cfi', cfi: state.cfi });
    }

    return startReadingFrom({ type: 'charOffset', offset: state.charOffset });
}

/**
 * 计算节点在文档中的 charOffset
 */
function calculateCharOffsetFromNode(target: HTMLElement, doc: Document): number | null {
    let charOffset = 0;

    // 查找所有带 data-block-id 或 data-sentence-id 的节点
    const allNodes = doc.querySelectorAll('[data-block-id], [data-sentence-id]');

    for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i] as HTMLElement;

        // 检查是否是目标节点或包含目标节点
        if (node === target || node.contains(target)) {
            return charOffset;
        }

        // 累加文本长度
        const text = sanitizeText(node.textContent || '');
        if (text) {
            charOffset += text.length + 1;
        }
    }

    return null;
}

/**
 * 清洗文本
 */
function sanitizeText(text: string): string {
    return text
        .replace(/\s+/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
}
