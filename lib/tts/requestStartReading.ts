/**
 * requestStartReading.ts
 * 
 * 🚨 唯一朗读入口守门函数（Gate）
 * 
 * 核心原则：
 * ❌ UI 层禁止直接操作 cursor、sentenceId 或 speakLoop
 * ✅ 所有点击朗读必须只调用 requestStartReading(entry)
 * 
 * 数据流：
 * 用户点击（任何栏）
 *   ↓
 * DOM → blockId / charOffset
 *   ↓
 * requestStartReading(entry) ← 唯一入口
 *   ↓
 * Resolver.resolve()
 *   ↓
 * globalReadingCursor.setPosition()
 *   ↓
 * speakLoop.start()
 */

import { readingEntryResolver, type ReadingEntry } from './ReadingEntryResolver';
import { globalReadingCursor } from './GlobalReadingCursor';
import { timelineHighlighter } from './TimelineHighlighter';

// Re-export for convenience
export type { ReadingEntry } from './ReadingEntryResolver';

// 朗读启动回调（由 useEpubTTS 注册）
let speakLoopStartCallback: ((offset: number) => void) | null = null;

/**
 * 注册 speakLoop 启动回调
 * 
 * 由 useEpubTTS 调用
 */
export function registerSpeakLoopCallback(callback: (offset: number) => void): () => void {
    speakLoopStartCallback = callback;
    return () => {
        speakLoopStartCallback = null;
    };
}

/**
 * 强制退出所有本地 cursor
 * 
 * 清除任何可能存在的"侧栏 cursor"状态
 */
function forceExitAllLocalCursors(): void {
    // 停止当前朗读
    if (globalReadingCursor.isReading()) {
        globalReadingCursor.stopReading();
    }

    // 停止时间轴高亮
    timelineHighlighter.stop();

    console.log('[requestStartReading] Forced exit all local cursors');
}

export interface RequestStartReadingOptions {
    /** 开始朗读后的回调 */
    onStart?: () => void;
    /** 解析失败的回调 */
    onResolveFailed?: (entry: ReadingEntry) => void;
}

/**
 * 🚨 唯一允许被 UI 调用的朗读入口
 * 
 * 不管单语 / 双语 / 翻译，所有点击朗读必须只调用这个函数。
 * UI 不允许直接操作 cursor、sentenceId 或 speakLoop。
 * 
 * @param entry - 朗读入口（只接受 charOffset / cfi / block）
 * @param options - 可选回调
 * @returns 是否成功启动
 */
export function requestStartReading(entry: ReadingEntry, options: RequestStartReadingOptions = {}): boolean {
    console.log('[requestStartReading] Entry:', entry);

    // 1️⃣ 强制退出所有本地 cursor
    forceExitAllLocalCursors();

    // 2️⃣ 统一走 Resolver
    const resolved = readingEntryResolver.resolve(entry);
    if (!resolved) {
        console.warn('[requestStartReading] Resolve failed:', entry);
        options.onResolveFailed?.(entry);
        return false;
    }

    console.log('[requestStartReading] Resolved:', resolved);

    // 3️⃣ 设置全局游标（唯一）
    globalReadingCursor.setPosition(
        resolved.charOffset,
        resolved.spineIndex,
        resolved.cfi
    );

    // 4️⃣ 启动 speak loop
    if (speakLoopStartCallback) {
        speakLoopStartCallback(resolved.charOffset);
        options.onStart?.();
        console.log('[requestStartReading] Speak loop started from offset:', resolved.charOffset);
        return true;
    } else {
        console.warn('[requestStartReading] No speak loop callback registered');
        return false;
    }
}

/**
 * 从 DOM 点击事件开始朗读
 * 
 * @param target - 点击的 DOM 元素
 * @param doc - 当前文档（用于计算 offset）
 */
export function requestStartReadingFromClick(target: HTMLElement, doc?: Document): boolean {
    // 优先使用 block
    const blockNode = target.closest('[data-block-id]') as HTMLElement | null;
    if (blockNode?.dataset?.blockId) {
        return requestStartReading({
            type: 'block',
            blockId: blockNode.dataset.blockId
        });
    }

    // 其次计算 charOffset
    if (doc) {
        const offset = calculateCharOffsetFromNode(target, doc);
        if (offset !== null) {
            return requestStartReading({
                type: 'charOffset',
                offset
            });
        }
    }

    // 降级到 offset 0
    console.warn('[requestStartReadingFromClick] No valid target, fallback to offset 0');
    return requestStartReading({ type: 'charOffset', offset: 0 });
}

/**
 * 从 charOffset 计算节点位置
 */
function calculateCharOffsetFromNode(target: HTMLElement, doc: Document): number | null {
    let charOffset = 0;
    const allNodes = doc.querySelectorAll('[data-block-id], [data-sentence-id]');

    for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i] as HTMLElement;

        if (node === target || node.contains(target)) {
            return charOffset;
        }

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
