/**
 * Chapter Translation State Machine
 * 
 * 管理每个章节的翻译状态，支持：
 * - 状态追踪 (idle → queued → translating → ready/failed)
 * - 取消机制 (AbortController)
 * - 优先级队列
 * - TTS 等待翻译完成
 */

export type TranslationStatus = 'idle' | 'queued' | 'translating' | 'ready' | 'failed';
export type TranslationPriority = 'high' | 'medium' | 'low';

export interface ChapterTranslationState {
    chapterId: string;           // spine index as string
    spineIndex: number;
    status: TranslationStatus;
    priority: TranslationPriority;
    abortController?: AbortController;
    translatedAt?: Date;
    error?: string;
    // Promise for TTS to wait on
    readyPromise?: Promise<void>;
    readyResolver?: () => void;
}

interface TranslationJob {
    spineIndex: number;
    priority: TranslationPriority;
    abortController: AbortController;
    promise: Promise<void>;
}

class ChapterTranslationManager {
    private states: Map<number, ChapterTranslationState> = new Map();
    private activeJobs: Map<number, TranslationJob> = new Map();
    private translationQueue: number[] = [];
    private maxConcurrent = 1; // Only translate one chapter at a time
    private isProcessing = false;

    // Callbacks to be set by the EPUB renderer
    private translateChapterFn: ((spineIndex: number, signal: AbortSignal) => Promise<boolean>) | null = null;

    /**
     * Set the translation function (called by EPUB renderer)
     */
    setTranslateFunction(fn: (spineIndex: number, signal: AbortSignal) => Promise<boolean>) {
        this.translateChapterFn = fn;
    }

    /**
     * Get chapter state, creating if not exists
     */
    getState(spineIndex: number): ChapterTranslationState {
        if (!this.states.has(spineIndex)) {
            this.states.set(spineIndex, {
                chapterId: `spine-${spineIndex}`,
                spineIndex,
                status: 'idle',
                priority: 'medium',
            });
        }
        return this.states.get(spineIndex)!;
    }

    /**
     * Check if chapter is ready (translated)
     */
    isReady(spineIndex: number): boolean {
        const state = this.states.get(spineIndex);
        return state?.status === 'ready';
    }

    /**
     * Check if chapter is being translated
     */
    isTranslating(spineIndex: number): boolean {
        const state = this.states.get(spineIndex);
        return state?.status === 'translating' || state?.status === 'queued';
    }

    /**
     * Mark chapter as ready (called after translation completes)
     */
    markReady(spineIndex: number) {
        const state = this.getState(spineIndex);
        state.status = 'ready';
        state.translatedAt = new Date();
        state.error = undefined;

        // Resolve waiting promise
        if (state.readyResolver) {
            state.readyResolver();
        }

        console.log(`[TranslationManager] Chapter ${spineIndex} marked as ready`);
    }

    /**
     * Mark chapter as failed
     */
    markFailed(spineIndex: number, error: string) {
        const state = this.getState(spineIndex);
        state.status = 'failed';
        state.error = error;

        // Still resolve promise so waiting TTS can continue
        if (state.readyResolver) {
            state.readyResolver();
        }

        console.log(`[TranslationManager] Chapter ${spineIndex} failed: ${error}`);
    }

    /**
     * Request translation for a chapter
     * Returns a promise that resolves when translation is ready (or fails)
     */
    async requestTranslation(spineIndex: number, priority: TranslationPriority = 'medium'): Promise<boolean> {
        const state = this.getState(spineIndex);

        // Already ready
        if (state.status === 'ready') {
            return true;
        }

        // Already in progress, just wait
        if (state.status === 'translating' || state.status === 'queued') {
            if (state.readyPromise) {
                await state.readyPromise;
                return state.status === 'ready';
            }
        }

        // Create ready promise for waiting
        state.readyPromise = new Promise<void>((resolve) => {
            state.readyResolver = resolve;
        });

        state.status = 'queued';
        state.priority = priority;

        // Add to queue based on priority
        if (priority === 'high') {
            // High priority goes to front
            this.translationQueue.unshift(spineIndex);
        } else {
            this.translationQueue.push(spineIndex);
        }

        console.log(`[TranslationManager] Queued chapter ${spineIndex} with priority ${priority}`);

        // Process queue
        this.processQueue();

        // Wait for completion
        await state.readyPromise;
        return state.status === 'ready';
    }

    /**
     * Process the translation queue
     */
    private async processQueue() {
        if (this.isProcessing || this.activeJobs.size >= this.maxConcurrent) {
            return;
        }

        this.isProcessing = true;

        while (this.translationQueue.length > 0 && this.activeJobs.size < this.maxConcurrent) {
            const spineIndex = this.translationQueue.shift()!;
            const state = this.getState(spineIndex);

            // Skip if already ready or cancelled
            if (state.status === 'ready' || state.status === 'idle') {
                continue;
            }

            // Start translation
            state.status = 'translating';
            const abortController = new AbortController();
            state.abortController = abortController;

            const job: TranslationJob = {
                spineIndex,
                priority: state.priority,
                abortController,
                promise: this.executeTranslation(spineIndex, abortController.signal),
            };

            this.activeJobs.set(spineIndex, job);

            // Don't await here, let it run in background
            job.promise.finally(() => {
                this.activeJobs.delete(spineIndex);
                this.processQueue(); // Process next item
            });
        }

        this.isProcessing = false;
    }

    /**
     * Execute translation for a chapter
     */
    private async executeTranslation(spineIndex: number, signal: AbortSignal): Promise<void> {
        const state = this.getState(spineIndex);

        try {
            if (!this.translateChapterFn) {
                throw new Error('Translation function not set');
            }

            console.log(`[TranslationManager] Starting translation for chapter ${spineIndex}`);

            const success = await this.translateChapterFn(spineIndex, signal);

            if (signal.aborted) {
                console.log(`[TranslationManager] Translation aborted for chapter ${spineIndex}`);
                state.status = 'idle';
                return;
            }

            if (success) {
                this.markReady(spineIndex);
            } else {
                this.markFailed(spineIndex, 'Translation returned false');
            }
        } catch (error) {
            if (signal.aborted) {
                state.status = 'idle';
                return;
            }
            this.markFailed(spineIndex, error instanceof Error ? error.message : 'Unknown error');
        }
    }

    /**
     * Cancel translation for a chapter
     */
    cancel(spineIndex: number) {
        const state = this.states.get(spineIndex);
        if (!state) return;

        // Remove from queue
        const queueIndex = this.translationQueue.indexOf(spineIndex);
        if (queueIndex >= 0) {
            this.translationQueue.splice(queueIndex, 1);
        }

        // Abort if in progress
        if (state.abortController) {
            state.abortController.abort();
        }

        // Reset state
        state.status = 'idle';
        state.abortController = undefined;

        // Remove active job
        this.activeJobs.delete(spineIndex);

        console.log(`[TranslationManager] Cancelled translation for chapter ${spineIndex}`);
    }

    /**
     * Cancel all translations (called on book change, language change, etc.)
     */
    cancelAll() {
        console.log('[TranslationManager] Cancelling all translations');

        // Clear queue
        this.translationQueue = [];

        // Abort all active jobs
        for (const [spineIndex, job] of this.activeJobs) {
            job.abortController.abort();
        }
        this.activeJobs.clear();

        // Reset all states
        for (const [spineIndex, state] of this.states) {
            if (state.status !== 'ready') {
                state.status = 'idle';
                state.abortController = undefined;
            }
        }
    }

    /**
     * Clear all state (called on book change)
     */
    clear() {
        this.cancelAll();
        this.states.clear();
        console.log('[TranslationManager] Cleared all state');
    }

    /**
     * Wait for a chapter to be ready (for TTS)
     * If not translating, triggers translation with high priority
     */
    async waitForChapter(spineIndex: number, timeoutMs: number = 30000): Promise<boolean> {
        const state = this.getState(spineIndex);

        // Already ready
        if (state.status === 'ready') {
            return true;
        }

        // Request with high priority if not already in progress
        if (state.status === 'idle' || state.status === 'failed') {
            return this.requestTranslation(spineIndex, 'high');
        }

        // Wait with timeout
        const timeoutPromise = new Promise<void>((resolve) => {
            setTimeout(resolve, timeoutMs);
        });

        if (state.readyPromise) {
            await Promise.race([state.readyPromise, timeoutPromise]);
        } else {
            await timeoutPromise;
        }

        return state.status === 'ready';
    }

    /**
     * Get debug info
     */
    getDebugInfo() {
        return {
            stateCount: this.states.size,
            queueLength: this.translationQueue.length,
            activeJobs: this.activeJobs.size,
            states: Array.from(this.states.entries()).map(([idx, s]) => ({
                spineIndex: idx,
                status: s.status,
                priority: s.priority,
            })),
        };
    }
}

// Singleton instance
export const translationManager = new ChapterTranslationManager();
