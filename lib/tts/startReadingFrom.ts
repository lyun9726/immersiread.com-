/**
 * startReadingFrom.ts
 * 
 * 🎯 统一朗读入口 - 所有朗读操作的唯一入口点
 * 
 * 正确用法：
 * ✅ startReadingFrom({ type: "sentence", sentenceId: "xxx" })
 * ✅ startReadingFrom({ type: "paragraph", paragraphId: "xxx" })
 * ✅ startReadingFrom({ type: "cfi", cfi: "xxx" })
 * ✅ startReadingFrom({ type: "fallback" })
 * 
 * 禁止用法：
 * ❌ globalReadingCursor.setPosition(xxx)
 * ❌ startSpeakFromOffset(xxx)
 */

import { readingEntryResolver, type ReadingEntry } from './ReadingEntryResolver';
import { globalReadingCursor } from './GlobalReadingCursor';

// Re-export ReadingEntry for use in other modules
export type { ReadingEntry } from './ReadingEntryResolver';

export interface StartReadingOptions {
    /** 开始朗读后的回调 */
    onStart?: () => void;
    /** 解析失败的回调 */
    onResolveFailed?: (entry: ReadingEntry) => void;
}

// 朗读启动回调（由 useEpubTTS 注册）
let speakStartCallback: ((offset: number) => void) | null = null;

/**
 * 注册朗读启动回调
 * 
 * 由 useEpubTTS 调用
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
 * 所有朗读操作必须通过这个函数
 * 
 * @param entry - 朗读入口
 * @param options - 选项
 */
export function startReadingFrom(entry: ReadingEntry, options: StartReadingOptions = {}): boolean {
    console.log('[startReadingFrom] Entry:', entry);

    // 1️⃣ 通过 Resolver 解析
    const resolved = readingEntryResolver.resolve(entry);

    if (!resolved) {
        console.warn('[startReadingFrom] Resolve failed:', entry);
        options.onResolveFailed?.(entry);
        return false;
    }

    console.log('[startReadingFrom] Resolved:', resolved);

    // 2️⃣ 更新全局游标
    globalReadingCursor.setPosition(
        resolved.charOffset,
        resolved.spineIndex,
        resolved.cfi
    );

    // 3️⃣ 触发朗读
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
 * 自动检测点击目标的类型（sentence / paragraph / block）
 */
export function startReadingFromClick(target: HTMLElement): boolean {
    // 优先检测 paragraph
    const paragraphNode = target.closest('[data-block-id]') as HTMLElement | null;
    if (paragraphNode?.dataset?.blockId) {
        return startReadingFrom({
            type: "paragraph",
            paragraphId: paragraphNode.dataset.blockId
        });
    }

    // 其次检测 sentence
    const sentenceNode = target.closest('[data-sentence-id]') as HTMLElement | null;
    if (sentenceNode?.dataset?.sentenceId) {
        return startReadingFrom({
            type: "sentence",
            sentenceId: sentenceNode.dataset.sentenceId
        });
    }

    // 降级
    console.warn('[startReadingFromClick] No valid target found');
    return startReadingFrom({ type: "fallback" });
}

/**
 * 从 CFI 继续朗读（翻页 / relocation 后使用）
 */
export function startReadingFromCFI(cfi: string): boolean {
    return startReadingFrom({ type: "cfi", cfi });
}

/**
 * 从当前位置继续朗读
 */
export function resumeReading(): boolean {
    const state = globalReadingCursor.getState();

    if (state.cfi) {
        return startReadingFrom({ type: "cfi", cfi: state.cfi });
    }

    return startReadingFrom({
        type: "offset",
        charOffset: state.charOffset
    });
}

/**
 * 模式切换后继续朗读
 * 
 * 📌 模式切换不改变起点
 */
export function restartAfterModeChange(): boolean {
    const state = globalReadingCursor.getState();

    if (state.cfi) {
        return startReadingFrom({ type: "cfi", cfi: state.cfi });
    }

    // 降级到当前 offset
    return startReadingFrom({
        type: "offset",
        charOffset: state.charOffset
    });
}
