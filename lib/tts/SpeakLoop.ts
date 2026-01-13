/**
 * SpeakLoop.ts
 * 
 * 持续朗读引擎 - 由 GlobalReadingCursor 驱动
 * 
 * 数据流：
 * globalReadingCursor.charOffset
 *   ↓
 * extractSentencesFromOffset(offset)
 *   ↓
 * buildUtterance(textChunk)
 *   ↓
 * speechSynthesis.speak()
 *   ↓
 * 朗读结束 → cursor += spokenLength
 *   ↓
 * 继续 speak（即使跨章节）
 * 
 * 📌 章节只是文本容器，不是朗读单位
 */

import { globalReadingCursor } from './GlobalReadingCursor';
import { sentenceRegistry, type Sentence } from './SentenceRegistry';
import { timelineHighlighter } from './TimelineHighlighter';
import { buildTTSInput } from './polyphone';
import { sanitizeText, isValidText } from './speakableTextResolver';

export interface SpeakLoopOptions {
    rate?: number;
    pitch?: number;
    voiceURI?: string;
    /** 获取当前文档的回调 */
    getDocument?: () => Document | null;
    /** 翻页回调 */
    onNeedPageTurn?: () => void;
    /** 朗读完成回调 */
    onComplete?: () => void;
    /** 朗读错误回调 */
    onError?: (error: string) => void;
}

/**
 * 持续朗读引擎
 */
class SpeakLoopClass {
    private synthRef: SpeechSynthesis | null = null;
    private utteranceRef: SpeechSynthesisUtterance | null = null;
    private options: SpeakLoopOptions = {};
    private sessionId = 0;

    /**
     * 初始化
     */
    init(): void {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            this.synthRef = window.speechSynthesis;
        }
    }

    /**
     * 配置选项
     */
    configure(options: SpeakLoopOptions): void {
        this.options = { ...this.options, ...options };
    }

    /**
     * 从当前游标位置开始朗读
     */
    startFromCursor(): void {
        if (!this.synthRef) {
            console.error('[SpeakLoop] SpeechSynthesis not available');
            return;
        }

        const offset = globalReadingCursor.getCharOffset();
        console.log('[SpeakLoop] startFromCursor:', offset);

        // 停止当前朗读
        this.synthRef.cancel();
        this.sessionId++;

        // 标记开始朗读
        globalReadingCursor.startReading();

        // 开始朗读循环
        this.speakChunk(offset);
    }

    /**
     * 从指定位置开始朗读
     */
    startFromOffset(offset: number): void {
        globalReadingCursor.setPosition(offset);
        this.startFromCursor();
    }

    /**
     * 暂停朗读
     */
    pause(): void {
        if (this.synthRef) {
            this.synthRef.pause();
            globalReadingCursor.pauseReading();
            timelineHighlighter.pause();
        }
    }

    /**
     * 恢复朗读
     */
    resume(): void {
        if (this.synthRef) {
            this.synthRef.resume();
            globalReadingCursor.resumeReading();
            timelineHighlighter.resume(this.options.rate || 1.0);
        }
    }

    /**
     * 停止朗读
     */
    stop(): void {
        this.sessionId++;
        if (this.synthRef) {
            this.synthRef.cancel();
        }
        globalReadingCursor.stopReading();
        timelineHighlighter.stop();
    }

    /**
     * 朗读一个文本块
     */
    private speakChunk(offset: number): void {
        if (!this.synthRef || !globalReadingCursor.isReading()) {
            return;
        }

        const currentSession = this.sessionId;

        // 获取当前文档
        const doc = this.options.getDocument?.();
        if (!doc) {
            console.warn('[SpeakLoop] No document available');
            return;
        }

        // 从 offset 提取句子
        const sentences = this.extractSentencesFromOffset(doc, offset);
        if (sentences.length === 0) {
            console.log('[SpeakLoop] No sentences at offset', offset, '- need page turn');
            this.options.onNeedPageTurn?.();
            return;
        }

        // 重建 SentenceRegistry
        sentenceRegistry.reset(sentences);

        // 构建朗读文本
        const utteranceText = sentences.map(s => s.text).join(' ');
        if (!utteranceText.trim()) {
            console.warn('[SpeakLoop] Empty utterance text');
            return;
        }

        // 创建 utterance
        const { speakText } = buildTTSInput(utteranceText);
        const utterance = new SpeechSynthesisUtterance(speakText);
        this.utteranceRef = utterance;

        utterance.rate = this.options.rate || 1.0;
        utterance.pitch = this.options.pitch || 1.0;

        // 设置语音
        const voices = this.synthRef.getVoices();
        if (this.options.voiceURI) {
            const voice = voices.find(v => v.voiceURI === this.options.voiceURI);
            if (voice) utterance.voice = voice;
        }

        // 启动时间轴高亮
        timelineHighlighter.setSentences(sentences);
        timelineHighlighter.start(0, speakText.length, this.options.rate || 1.0);

        // 事件处理
        utterance.onend = () => {
            if (this.sessionId !== currentSession) return;

            console.log('[SpeakLoop] Chunk ended, advancing cursor');

            // 推进游标
            globalReadingCursor.advance(speakText.length);

            // 停止当前高亮
            timelineHighlighter.stop();

            // 继续朗读下一块（即使跨章节）
            if (globalReadingCursor.isReading()) {
                // 检查是否需要翻页
                const newOffset = globalReadingCursor.getCharOffset();
                const newSentences = this.extractSentencesFromOffset(doc, newOffset);

                if (newSentences.length === 0) {
                    // 当前页没有更多内容了，需要翻页
                    console.log('[SpeakLoop] Need page turn');
                    this.options.onNeedPageTurn?.();
                } else {
                    // 继续朗读
                    this.speakChunk(newOffset);
                }
            } else {
                this.options.onComplete?.();
            }
        };

        utterance.onerror = (event) => {
            if (event.error !== 'interrupted') {
                console.error('[SpeakLoop] Error:', event.error);
                this.options.onError?.(event.error);
                this.stop();
            }
        };

        // 开始朗读
        this.synthRef.speak(utterance);
    }

    /**
     * 页面加载完成后继续朗读
     */
    continueAfterPageTurn(): void {
        if (!globalReadingCursor.isReading()) return;

        // 新页面从 offset 0 开始
        globalReadingCursor.setPosition(0);
        this.speakChunk(0);
    }

    /**
     * 从 DOM 提取句子
     */
    private extractSentencesFromOffset(doc: Document, startOffset: number): Sentence[] {
        const sentences: Sentence[] = [];
        let accumulatedOffset = 0;
        let outputStart = 0;

        const sentenceNodes = doc.querySelectorAll('[data-sentence-id]');

        for (let i = 0; i < sentenceNodes.length; i++) {
            const node = sentenceNodes[i] as HTMLElement;
            const id = node.dataset?.sentenceId;
            if (!id) continue;

            const rawText = node.textContent || '';
            const cleanText = sanitizeText(rawText);
            if (!cleanText || !isValidText(cleanText)) continue;

            if (accumulatedOffset >= startOffset) {
                sentences.push({
                    id,
                    text: cleanText,
                    start: outputStart,
                    end: outputStart + cleanText.length,
                    node,
                });
                outputStart += cleanText.length + 1;
            }

            accumulatedOffset += cleanText.length + 1;
        }

        return sentences;
    }
}

// 单例导出
export const speakLoop = new SpeakLoopClass();
