/**
 * GlobalReadingCursor.ts
 * 
 * 全局朗读游标 - 朗读驱动的唯一入口
 * 
 * 核心原则：
 * - 朗读必须由「全局朗读游标」驱动，而不是章节或 block
 * - 章节只是文本容器，不是朗读单位
 * 
 * ❌ 禁止：chapterCursor / blockCursor / 章节结束即 stop
 * ✅ 正确：全书级 charOffset 持续推进
 */

export interface GlobalReadingCursorState {
    charOffset: number;       // 全书级字符偏移
    spineIndex: number;       // 当前 spine 索引（用于跨章节）
    cfi?: string;             // EPUB CFI（翻页用）
    isReading: boolean;       // 是否正在朗读
    isPaused: boolean;        // 是否暂停
}

type CursorChangeListener = (cursor: GlobalReadingCursorState) => void;

/**
 * 全局朗读游标单例
 */
class GlobalReadingCursorClass {
    private state: GlobalReadingCursorState = {
        charOffset: 0,
        spineIndex: 0,
        cfi: undefined,
        isReading: false,
        isPaused: false,
    };

    private listeners: Set<CursorChangeListener> = new Set();

    // ============ 状态获取 ============

    getState(): GlobalReadingCursorState {
        return { ...this.state };
    }

    getCharOffset(): number {
        return this.state.charOffset;
    }

    getSpineIndex(): number {
        return this.state.spineIndex;
    }

    isReading(): boolean {
        return this.state.isReading;
    }

    isPaused(): boolean {
        return this.state.isPaused;
    }

    // ============ 状态更新（唯一入口） ============

    /**
     * 设置游标位置（点击朗读时调用）
     */
    setPosition(charOffset: number, spineIndex?: number, cfi?: string): void {
        this.state.charOffset = charOffset;
        if (spineIndex !== undefined) this.state.spineIndex = spineIndex;
        if (cfi !== undefined) this.state.cfi = cfi;
        console.log('[GlobalCursor] setPosition:', charOffset, 'spine:', spineIndex);
        this.notifyListeners();
    }

    /**
     * 推进游标（朗读完成一段后调用）
     */
    advance(spokenLength: number): void {
        this.state.charOffset += spokenLength;
        console.log('[GlobalCursor] advance by', spokenLength, '→', this.state.charOffset);
        this.notifyListeners();
    }

    /**
     * 开始朗读
     */
    startReading(): void {
        this.state.isReading = true;
        this.state.isPaused = false;
        console.log('[GlobalCursor] startReading');
        this.notifyListeners();
    }

    /**
     * 暂停朗读
     */
    pauseReading(): void {
        this.state.isPaused = true;
        console.log('[GlobalCursor] pauseReading');
        this.notifyListeners();
    }

    /**
     * 恢复朗读
     */
    resumeReading(): void {
        this.state.isPaused = false;
        console.log('[GlobalCursor] resumeReading');
        this.notifyListeners();
    }

    /**
     * 停止朗读
     */
    stopReading(): void {
        this.state.isReading = false;
        this.state.isPaused = false;
        console.log('[GlobalCursor] stopReading');
        this.notifyListeners();
    }

    /**
     * 切换到下一个 spine（跨章节时调用）
     */
    nextSpine(): void {
        this.state.spineIndex += 1;
        this.state.charOffset = 0; // 新章节从头开始
        console.log('[GlobalCursor] nextSpine →', this.state.spineIndex);
        this.notifyListeners();
    }

    /**
     * 重置游标
     */
    reset(): void {
        this.state = {
            charOffset: 0,
            spineIndex: 0,
            cfi: undefined,
            isReading: false,
            isPaused: false,
        };
        console.log('[GlobalCursor] reset');
        this.notifyListeners();
    }

    // ============ 监听器管理 ============

    subscribe(listener: CursorChangeListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const snapshot = this.getState();
        this.listeners.forEach(listener => listener(snapshot));
    }
}

// 单例导出
export const globalReadingCursor = new GlobalReadingCursorClass();
