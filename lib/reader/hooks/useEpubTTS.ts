
/**
 * useEpubTTS - React hook for EPUB TTS with sync highlighting
 * 
 * 🎯 全局朗读游标架构：
 * 
 * 核心原则：
 * - 朗读必须由「全局朗读游标」驱动，而不是章节或 block
 * - 章节只是文本容器，不是朗读单位
 * - 高亮来源：时间轴，不是浏览器 boundary
 * 
 * 数据流：
 * globalReadingCursor.charOffset
 *   → extractSentencesFromOffset(offset)
 *   → buildUtterance(textChunk)
 *   → speechSynthesis.speak()
 *   → 朗读结束 → cursor += spokenLength
 *   → 继续 speak（即使跨章节）
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { epubTTSController } from '../controllers/EpubTTSController';
import { useReaderStore } from '../stores/readerStore';
import { buildTTSInput } from '@/lib/tts/polyphone';
import { sentenceRegistry, type Sentence } from '@/lib/tts/SentenceRegistry';
// 🆕 移除 globalReadingCursor，使用 readerStore.tts 作为唯一驱动源
import { timelineHighlighter } from '@/lib/tts/TimelineHighlighter';
import { readingEntryResolver } from '@/lib/tts/ReadingEntryResolver';
import { domOffsetResolver } from '@/lib/tts/DOMOffsetResolver';
import { isValidText, sanitizeText } from '@/lib/tts/speakableTextResolver';

/**
 * 🆕 注入高亮样式到 EPUB iframe
 */
const TTS_HIGHLIGHT_STYLES = `
.tts-highlight-word {
    background: linear-gradient(120deg, #fcd34d 0%, #fbbf24 100%);
    border-radius: 2px;
    padding: 1px 2px;
    transition: background 0.15s ease;
}
.tts-highlight-sentence {
    background: rgba(252, 211, 77, 0.3);
    border-radius: 4px;
}
.tts-highlight-translation {
    background: linear-gradient(120deg, #a78bfa 0%, #8b5cf6 100%);
    border-radius: 2px;
    padding: 1px 2px;
}
`;

function injectHighlightStyles(doc: Document): void {
    const styleId = 'tts-highlight-styles';
    if (doc.getElementById(styleId)) return; // 已经注入过

    const style = doc.createElement('style');
    style.id = styleId;
    style.textContent = TTS_HIGHLIGHT_STYLES;
    doc.head.appendChild(style);
    console.log('[useEpubTTS] Injected highlight styles into iframe');
}

interface UseEpubTTSOptions {
    rate?: number;
    pitch?: number;
    voiceURI?: string;
}

interface UseEpubTTSReturn {
    isPlaying: boolean;
    isPaused: boolean;
    currentCharIndex: number;
    play: () => Promise<void>;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    invalidate: (reason: string) => void; // NEW: Invalidate TTS session on navigation
    setRendition: (rendition: any) => void;
    epubTTSController: any;
}

export function useEpubTTS(options: UseEpubTTSOptions = {}): UseEpubTTSReturn {
    const { rate = 1.0, pitch = 1.0, voiceURI } = options;

    // Store Actions - 🆕 使用 readerStore.tts 作为唯一驱动源
    const ttsPlay = useReaderStore((state) => state.ttsPlay);
    const ttsPause = useReaderStore((state) => state.ttsPause);
    const ttsStop = useReaderStore((state) => state.ttsStop);
    const setCurrentOffset = useReaderStore((state) => state.setCurrentOffset);
    const ttsState = useReaderStore((state) => state.tts);

    // 🆕 获取阅读模式（original / translation / bilingual）
    const readingMode = useReaderStore((state) => state.readingMode);

    // Local state for immediate reactivity, but synced with Store
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [currentCharIndex, setCurrentCharIndex] = useState(-1);

    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);
    const renditionRef = useRef<any>(null);

    const isAutoTurningRef = useRef(false);
    const indexRef = useRef(currentCharIndex);
    const wasPausedRef = useRef(false);
    const pendingResumeRef = useRef(false);

    // TTS Session Token - used to invalidate stale callbacks after navigation
    const ttsSessionIdRef = useRef(0);

    // 🆕 当前活跃的句子 ID（用于高亮）
    const activeSentenceIdRef = useRef<string | null>(null);

    // 🆕 SpeechSynthesis-only 架构：移除了所有 silent audio 相关代码
    // MediaSession handlers 仍然可以工作，但不需要 audio element

    // Initialize MediaSession handlers (no audio element needed)
    useEffect(() => {
        if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
            // Play/Pause handlers - 直接使用 SpeechSynthesis
            navigator.mediaSession.setActionHandler('play', () => {
                console.log('[MediaSession] Play command');
                if (synthRef.current && synthRef.current.paused) {
                    synthRef.current.resume();
                    setIsPaused(false);
                    ttsPlay();
                } else if (!useReaderStore.getState().tts.isPlaying) {
                    ttsPlay();
                }
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                console.log('[MediaSession] Pause command');
                if (synthRef.current && synthRef.current.speaking) {
                    synthRef.current.pause();
                    setIsPaused(true);
                    ttsPause();
                }
            });

            // Next/Auto-advance handler
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                useReaderStore.getState().triggerTTSCommand('next');
            });

            // Prev handler
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                console.log('[MediaSession] Prev command');
                useReaderStore.getState().triggerTTSCommand('prev');
            });
        }
    }, [ttsPlay, ttsPause]);

    /**
     * Update Media Session Metadata
     */
    const updateMediaSession = useCallback(() => {
        if ('mediaSession' in navigator) {
            // Get book metadata via Controller or Store if possible
            // Currently using generic fallback, ideally should come from current book info
            // Since we don't have direct access to bookMetadata here nicely, we use placeholders
            // In a real app, pass bookTitle/author coverUrl as props or get from store

            // Try to extract title from page text if available or use generic
            const title = "Reading current page...";

            navigator.mediaSession.metadata = new MediaMetadata({
                title: "eBook TTS Reading",
                artist: "ReadAI",
                album: "Audio Book",
                artwork: [
                    { src: '/placeholder.svg?text=Book', sizes: '96x96', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '128x128', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '192x192', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '256x256', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '384x384', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '512x512', type: 'image/png' },
                ]
            });

            // Set playback state
            navigator.mediaSession.playbackState = 'playing';
        }
    }, []);

    // Keep ref synced with state
    useEffect(() => {
        indexRef.current = currentCharIndex;
    }, [currentCharIndex]);

    // Get TTS settings and actions from store
    // Select individually to prevent infinite loops from object identity changes
    const tts = useReaderStore(state => state.tts);

    const ttsCommand = useReaderStore(state => state.ttsCommand);

    // Command tracking to avoid duplicate execution
    const lastCommandRef = useRef(ttsCommand);

    // Initialize speech synthesis
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            synthRef.current = window.speechSynthesis;
        }

        return () => {
            if (synthRef.current) {
                synthRef.current.cancel();
            }
            epubTTSController.clearHighlights();
        };
    }, []);

    /**
     * Set the epub.js rendition for TTS controller
     */
    const setRendition = useCallback((rendition: any) => {
        console.log('[useEpubTTS] setRendition called');
        renditionRef.current = rendition;
        epubTTSController.setRendition(rendition);
    }, []);

    /**
     * ✅ 高亮的唯一入口：设置当前活跃句子
     * 只在 onboundary 回调中调用
     */
    const setActiveSentence = useCallback((sentenceId: string) => {
        if (activeSentenceIdRef.current === sentenceId) return; // 避免重复高亮

        activeSentenceIdRef.current = sentenceId;
        const sentence = sentenceRegistry.getById(sentenceId);

        if (sentence?.node) {
            // 清除旧高亮
            epubTTSController.clearHighlights();
            // 添加新高亮
            sentence.node.classList.add('tts-highlight-sentence');
        }
    }, []);

    /**
     * 确保当前句子可见（滚动到视图中）
     */
    const ensureVisible = useCallback((sentenceId: string) => {
        const sentence = sentenceRegistry.getById(sentenceId);
        if (sentence?.node) {
            sentence.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, []);

    /**
     * 从 DOM 计算节点的 charOffset
     */
    const calculateOffsetFromDOM = useCallback((targetNode: HTMLElement, doc: Document): number | null => {
        let charOffset = 0;
        const allNodes = doc.querySelectorAll('[data-block-id], [data-sentence-id]');

        for (let i = 0; i < allNodes.length; i++) {
            const node = allNodes[i] as HTMLElement;

            // 检查是否是目标节点或包含目标节点
            if (node === targetNode || node.contains(targetNode)) {
                return charOffset;
            }

            // 累加文本长度
            const text = sanitizeText(node.textContent || '');
            if (text && isValidText(text)) {
                charOffset += text.length + 1;
            }
        }

        return null;
    }, []);

    /**
     * 检查节点是否有指定 class 的祖先
     */
    const hasAncestorClass = (node: HTMLElement, className: string): boolean => {
        let current: HTMLElement | null = node;
        while (current) {
            if (current.classList?.contains(className)) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    };

    /**
     * 从 DOM 提取从 offset 开始的句子
     * 这是每次朗读会话唯一的句子提取入口
     * 
     * 🆕 根据 readingMode 过滤：
     * - original: 只朗读原文（bbm-original 或未标记的内容）
     * - translation: 只朗读译文（bbm-translated）
     * - bilingual: 朗读原文（译文只做高亮跟随）
     */
    const extractSentencesFromOffset = useCallback((doc: Document, startOffset: number = 0): Sentence[] => {
        const sentences: Sentence[] = [];
        let accumulatedOffset = 0;  // 累计的字符偏移
        let outputStart = 0;        // 输出句子的 start

        // 获取当前阅读模式
        const currentReadingMode = useReaderStore.getState().readingMode;
        console.log('[useEpubTTS] Extracting sentences with readingMode:', currentReadingMode);

        const sentenceNodes = doc.querySelectorAll('[data-sentence-id]');

        for (let i = 0; i < sentenceNodes.length; i++) {
            const node = sentenceNodes[i] as HTMLElement;
            const id = node.dataset?.sentenceId;
            if (!id) continue;

            // 🆕 根据 readingMode 过滤节点
            const isOriginal = hasAncestorClass(node, 'bbm-original');
            const isTranslated = hasAncestorClass(node, 'bbm-translated');

            // 根据模式决定是否跳过
            if (currentReadingMode === 'translation') {
                // 翻译模式：只读译文
                if (isOriginal) continue;
            } else if (currentReadingMode === 'original') {
                // 原文模式：只读原文
                if (isTranslated) continue;
            }
            // bilingual 模式：读原文（译文由 BilingualAlignment 映射高亮）
            // 也只读原文部分，避免重复
            if (currentReadingMode === 'bilingual') {
                if (isTranslated) continue;
            }

            const rawText = node.textContent || '';
            const cleanText = sanitizeText(rawText);
            if (!cleanText || !isValidText(cleanText)) continue;

            // 当累计偏移 >= startOffset 时，开始收集句子
            if (accumulatedOffset >= startOffset) {
                sentences.push({
                    id,
                    text: cleanText,
                    start: outputStart,
                    end: outputStart + cleanText.length,
                    node,
                });
                outputStart += cleanText.length + 1; // +1 for space
            }

            accumulatedOffset += cleanText.length + 1; // +1 for space
        }

        console.log('[useEpubTTS] Extracted', sentences.length, 'sentences for mode:', currentReadingMode);
        return sentences;
    }, []);

    /**
     * 🆕 最终版：从 offset 开始朗读（朗读会话唯一入口）
     * 
     * 数据流：
     * 1. 终止旧朗读
     * 2. 从 offset 重新提取句子
     * 3. 重建 SentenceRegistry（不是复用）
     * 4. 构建 utterance
     * 5. 绑定 onboundary
     * 6. 开始朗读
     */
    const startSpeakFromOffset = useCallback((offset: number = 0) => {
        if (!synthRef.current) {
            console.error('[useEpubTTS] SpeechSynthesis not available');
            return;
        }

        if (epubTTSController.isTranslating()) {
            console.warn('[useEpubTTS] Blocked: translation in progress');
            return;
        }

        // 1️⃣ 终止旧朗读（非常重要）
        synthRef.current.cancel();

        // 2️⃣ 获取当前文档
        const contents = renditionRef.current?.getContents?.();
        if (!contents || contents.length === 0) {
            console.warn('[useEpubTTS] No contents available');
            return;
        }
        const doc = contents[0].document;
        if (!doc) {
            console.warn('[useEpubTTS] No document available');
            return;
        }

        // 🆕 2.5️⃣ 重建 textSegments（翻页后必须，否则高亮会失败）
        epubTTSController.extractCurrentPageText().then(() => {
            console.log('[useEpubTTS] textSegments rebuilt for current page');
        }).catch(e => {
            console.warn('[useEpubTTS] Failed to rebuild textSegments:', e);
        });

        // 3️⃣ 从 offset 提取句子
        const sentences = extractSentencesFromOffset(doc, offset);
        if (sentences.length === 0) {
            console.warn('[useEpubTTS] No sentences extracted from offset', offset);
            return;
        }

        // 4️⃣ 重建 SentenceRegistry（不是复用！）
        sentenceRegistry.reset(sentences);

        // 5️⃣ 构建 utterance
        const utteranceText = sentences.map(s => s.text).join(' ');
        if (!utteranceText.trim()) {
            console.warn('[useEpubTTS] Empty utterance text');
            return;
        }

        ttsSessionIdRef.current++;
        const currentSession = ttsSessionIdRef.current;
        console.log('[useEpubTTS] startSpeakFromOffset:', offset, 'session:', currentSession);

        const { speakText } = buildTTSInput(utteranceText);
        const utterance = new SpeechSynthesisUtterance(speakText);
        utteranceRef.current = utterance;

        const currentTTS = useReaderStore.getState().tts;
        utterance.rate = currentTTS.rate || rate;
        utterance.pitch = currentTTS.pitch || pitch;

        // 设置语音
        const voices = synthRef.current.getVoices();
        const targetVoice = currentTTS.voiceId || voiceURI;
        if (targetVoice) {
            const voice = voices.find(v => v.voiceURI === targetVoice);
            if (voice) utterance.voice = voice;
        }

        // 🆕 配置时间轴高亮（基于时间函数，不依赖 onboundary）
        timelineHighlighter.configure({
            averageCharMs: 50 / (currentTTS.rate || 1.0), // 根据语速调整
            onHighlightUpdate: (charOffset, token) => {
                console.log('[useEpubTTS] Highlight update:', charOffset, token?.text);
            },
            onTimelineEnd: () => {
                console.log('[useEpubTTS] Timeline ended');
            }
        });

        utterance.onstart = () => {
            if (ttsSessionIdRef.current !== currentSession) return;
            setIsPlaying(true);
            setIsPaused(false);

            // 使用 readerStore.tts 作为唯一驱动源
            setCurrentOffset(offset);
            ttsPlay();

            // 🔴 暂时禁用高亮 - offset 系统不兼容会导致高亮位置错误
            // 高亮功能由 play() 路径处理，这里只处理朗读
            // TODO: 未来可以统一 offset 系统后再启用

            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        };

        // 🔴 暂时禁用 onboundary 高亮 - 使用 play() 路径的高亮
        // 这里只处理核心朗读功能
        utterance.onboundary = (event) => {
            if (ttsSessionIdRef.current !== currentSession) return;
            // 只更新 offset 用于续读，不触发高亮
            if (event.name === 'word') {
                setCurrentOffset(offset + event.charIndex);
            }
        };

        utterance.onend = () => {
            if (ttsSessionIdRef.current !== currentSession) return;
            console.log('[useEpubTTS] Utterance ended');

            // 🆕 推进 offset（使用 readerStore.tts）
            const newOffset = ttsState.currentOffset + speakText.length;
            setCurrentOffset(newOffset);

            activeSentenceIdRef.current = null;
            epubTTSController.clearHighlights();

            // 继续朗读（跨章节自动持续）- 使用 readerStore.tts.isPlaying
            if (ttsState.isPlaying) {
                // 检查当前页是否还有内容
                const nextSentences = extractSentencesFromOffset(doc, newOffset);
                if (nextSentences.length === 0) {
                    // 需要翻页
                    console.log('[useEpubTTS] Need page turn, continuing reading');
                    isAutoTurningRef.current = true;
                    epubTTSController.nextPage();
                } else {
                    // 当前页还有内容，继续朗读
                    console.log('[useEpubTTS] Continue reading from offset:', newOffset);
                    // 递归调用会在下一个 tick 执行，避免堆栈溢出
                    setTimeout(() => {
                        if (useReaderStore.getState().tts.isPlaying) {
                            startSpeakFromOffset(newOffset);
                        }
                    }, 50);
                }
            }
        };

        utterance.onerror = (event) => {
            if (event.error !== 'interrupted') {
                console.error('[useEpubTTS] Error:', event.error);
                setIsPlaying(false);
                setIsPaused(false);
                ttsStop();
                epubTTSController.clearHighlights();
            }
        };

        // 7️⃣ 开始朗读
        setIsPlaying(true);
        setIsPaused(false);
        ttsPlay();
        synthRef.current.speak(utterance);

    }, [rate, pitch, voiceURI, ttsPlay, ttsStop, extractSentencesFromOffset]);

    /**
     * Start TTS playback (legacy interface)
     * 
     * 核心原则：TTS 只接受已验证的纯文本
     */
    const play = useCallback(async (textToPlay?: string, startIndex: number = 0) => {
        if (!synthRef.current) {
            console.error('[useEpubTTS] SpeechSynthesis not available');
            return;
        }

        // 🆕 Block TTS when translation is in progress
        if (epubTTSController.isTranslating()) {
            console.warn('[useEpubTTS] Blocked: translation in progress');
            return;
        }

        // Check if voices are available
        const voices = synthRef.current.getVoices();
        console.log('[useEpubTTS] Available voices:', voices.length);
        if (voices.length === 0) {
            console.warn('[useEpubTTS] No TTS voices available on this browser');
            // Try loading voices after a delay (Android quirk)
            await new Promise(resolve => setTimeout(resolve, 500));
            const retryVoices = synthRef.current?.getVoices() || [];
            if (retryVoices.length === 0) {
                console.error('[useEpubTTS] Still no voices after retry');
                // Continue anyway - some browsers speak without listing voices
            }
        }


        // Update Media Session
        updateMediaSession();

        // Update Store if not already playing
        if (!useReaderStore.getState().tts.isPlaying) {
            ttsPlay();
        }

        synthRef.current.cancel();

        // NEW: Increment session ID - this invalidates all old onboundary callbacks
        ttsSessionIdRef.current++;
        const currentSession = ttsSessionIdRef.current;
        console.log('[useEpubTTS] Starting new TTS session:', currentSession);

        let text = textToPlay;
        if (!text) {
            const fullText = await epubTTSController.extractCurrentPageText();
            text = fullText.substring(startIndex);
        }

        // 🆕 Validate text using speakableTextResolver
        if (!isValidText(text)) {
            console.warn('[useEpubTTS] Invalid text, trying to advance...');
            const result = await epubTTSController.autoAdvanceAndContinue();
            if (result.success && result.text && isValidText(result.text)) {
                console.log('[useEpubTTS] Advanced to page with valid text');
                text = result.text;
                startIndex = 0;
            } else {
                console.warn('[useEpubTTS] Could not find valid text, stopping');
                ttsStop();
                return;
            }
        }

        // 🆕 Sanitize text before speaking
        text = sanitizeText(text);

        console.log('[useEpubTTS] Starting playback, length:', text.length, 'Offset:', startIndex);

        // Apply polyphone disambiguation for better Chinese TTS
        const { speakText, decisions, hasPolyphones } = buildTTSInput(text);
        if (hasPolyphones) {
            console.log('[useEpubTTS] Polyphone decisions:', decisions.length, decisions.slice(0, 5));
        }

        const currentTTS = useReaderStore.getState().tts;
        const utterance = new SpeechSynthesisUtterance(speakText);
        utteranceRef.current = utterance;

        utterance.rate = currentTTS.rate || rate;
        utterance.pitch = currentTTS.pitch || pitch;

        const availableVoices = synthRef.current.getVoices();
        const selectedVoiceURI = currentTTS.voiceId || voiceURI;
        if (selectedVoiceURI) {
            const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
            if (voice) utterance.voice = voice;
        }

        utterance.onstart = () => {
            console.log('[useEpubTTS] Playback started');
            setIsPlaying(true);
            setIsPaused(false);
            setCurrentCharIndex(startIndex);
            epubTTSController.highlightSentence(startIndex);

            // Sync Media Session state
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

            // Sync persistence on start
            const cfi = epubTTSController.getCfiForCharIndex(startIndex);
            const snippet = epubTTSController.getTextForCharIndex(startIndex);
            if (cfi) {
                useReaderStore.setState({ epubLocation: cfi, lastTextSnippet: snippet });
                useReaderStore.getState().saveProgress();
            }
        };

        utterance.onboundary = (event) => {
            // CRITICAL: Check if this callback is from the current session
            // If sessionId has changed (due to page navigation), ignore this callback
            if (currentSession !== ttsSessionIdRef.current) {
                return; // Stale callback - ignore silently
            }

            if (event.name === 'word') {
                const charIndex = event.charIndex + startIndex;
                const charLength = event.charLength;
                const syncDelay = Math.max(50, 150 / (currentTTS.rate || rate));

                setTimeout(() => {
                    // Double-check session is still valid after timeout
                    if (currentSession !== ttsSessionIdRef.current) {
                        return;
                    }

                    setCurrentCharIndex(charIndex);
                    epubTTSController.highlightWord(charIndex, charLength);

                    // Optimization: Check if sentence highlighted recently?
                    // highlightSentence logic inside Controller handles redundancy
                    epubTTSController.highlightSentence(charIndex);

                    // Sync persistence - Save charOffset directly for reliable resume
                    const cfi = epubTTSController.getCfiForCharIndex(charIndex);
                    const snippet = epubTTSController.getTextForCharIndex(charIndex);
                    const spineIndex = epubTTSController.getCurrentSpineIndex();

                    useReaderStore.setState({
                        epubLocation: cfi,
                        lastTextSnippet: snippet,
                        lastCharOffset: charIndex,
                        lastSpineIndex: spineIndex
                    });
                    useReaderStore.getState().saveProgress();
                }, syncDelay);
            }
        };

        utterance.onend = async () => {
            console.log('[useEpubTTS] Playback ended');

            // Check if we should auto-advance
            const nearEnd = epubTTSController.isNearEndOfPage();
            console.log('[useEpubTTS] Auto-advance check:', nearEnd);

            if (nearEnd) {
                const rendition = epubTTSController.getRendition();
                if (rendition) {
                    console.log('[useEpubTTS] Auto-advancing to next page (正确时序)...');

                    // 方案A: Use the correct flow - this does:
                    // 1. invalidate → 2. next() → 3. wait rendered → 4. extract → 5. return text
                    const result = await epubTTSController.autoAdvanceAndContinue();

                    if (result.success && result.text) {
                        console.log('[useEpubTTS] Auto-advance success, starting new TTS session');
                        // Start new TTS with the extracted text
                        play(result.text, 0);
                        return; // Don't stop
                    } else {
                        console.log('[useEpubTTS] Auto-advance failed or no text, stopping');
                    }
                }
            }

            // Only stop if NOT auto-advancing or auto-advance failed
            console.log('[useEpubTTS] Stopping playback');
            setIsPlaying(false);
            setIsPaused(false);
            setCurrentCharIndex(-1);
            epubTTSController.clearHighlights();
            ttsStop(); // Sync store

            // Update media session
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        };

        utterance.onerror = (event) => {
            console.error('[useEpubTTS] Error:', event.error);
            if (event.error !== 'interrupted') {
                setIsPlaying(false);
                setIsPaused(false);
                epubTTSController.clearHighlights();
                ttsStop();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            }
        };

        synthRef.current.speak(utterance);

    }, [rate, pitch, voiceURI, ttsPlay, ttsStop, updateMediaSession]);


    // ---------------------------------------------------------------------------
    // SYNC: Store State -> Local Synth (Defined AFTER play)
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!synthRef.current) return;

        // If Store says PLAYING
        if (tts.isPlaying) {

            // Case 1: We were explicitly paused -> Resume
            if (wasPausedRef.current && synthRef.current.paused) {
                console.log('[useEpubTTS] Store synced: Resume (wasPausedRef)');
                synthRef.current.resume();
                wasPausedRef.current = false;
                setIsPaused(false);
                setIsPlaying(true);
            }
            // Case 2: Synth is not speaking (idle) -> Start
            // IMPORTANT: Also check local isPlaying to avoid race condition where
            // onTextSelected already set isPlaying=true and called play(), but synth
            // hasn't started speaking yet. Without this check, we'd call play() twice.
            else if (!synthRef.current.speaking && !isPlaying) {
                console.log('[useEpubTTS] Store synced: Start (Synth was idle, isPlaying=false)');
                wasPausedRef.current = false;

                // Get saved resume position directly
                const savedCharOffset = useReaderStore.getState().lastCharOffset;
                const savedCfi = useReaderStore.getState().epubLocation;
                const rendition = epubTTSController.getRendition();

                console.log('[useEpubTTS] Debug: savedCharOffset=', savedCharOffset, 'savedCfi=', savedCfi?.substring(0, 40));
                console.log('[useEpubTTS] Debug: indexRef.current=', indexRef.current);

                // If we have a saved character offset, use it directly
                if (typeof savedCharOffset === 'number' && savedCharOffset > 0) {
                    console.log('[useEpubTTS] Resuming from saved charOffset:', savedCharOffset);

                    // Navigate to CFI first to ensure we're on the right page
                    if (savedCfi && rendition) {
                        pendingResumeRef.current = true;
                        // Store the offset in ref for onPageReady to use
                        indexRef.current = savedCharOffset;

                        rendition.display(savedCfi).catch((e: any) => {
                            console.warn('[useEpubTTS] Failed to navigate to CFI:', e);
                            pendingResumeRef.current = false;
                            // Fallback: try to play from saved offset anyway
                            play(undefined, savedCharOffset);
                        });
                    } else {
                        // No CFI but have offset, just start from offset
                        play(undefined, savedCharOffset);
                    }
                } else if (indexRef.current > 0) {
                    // Use local index if available
                    console.log('[useEpubTTS] Using indexRef.current:', indexRef.current);
                    play(undefined, indexRef.current);
                } else {
                    // No saved position, start from beginning
                    console.log('[useEpubTTS] No saved position, starting from beginning');
                    play();
                }
            }
            // Case 3: Synth is already speaking -> Ensure local state aligns
            else {
                if (!isPlaying) setIsPlaying(true);
                if (isPaused) setIsPaused(false);
            }
        }
        // If Store says PAUSED (isPlaying = false)
        else {
            // If synth is speaking, Pause it
            if (synthRef.current.speaking && !synthRef.current.paused) {
                console.log('[useEpubTTS] Store synced: Pause');
                console.log('[useEpubTTS] Debug: currentCharIndex=', currentCharIndex, 'indexRef.current=', indexRef.current);
                // Save current position before pausing
                indexRef.current = currentCharIndex;
                synthRef.current.pause();
                wasPausedRef.current = true; // Mark as explicitly paused
                setIsPaused(true);
                setIsPlaying(false);
            } else if (synthRef.current.paused) {
                // Synth was already paused (by useBrowserTTS or other source)
                console.log('[useEpubTTS] Store synced: Already paused, marking wasPausedRef');
                wasPausedRef.current = true;
                setIsPaused(true);
                setIsPlaying(false);
            } else {
                // Ensure local state aligns
                if (isPlaying) setIsPlaying(false);
            }
        }
    }, [tts.isPlaying, play]);

    // ---------------------------------------------------------------------------
    // COMMANDS: Handle Next/Prev from UI (Defined AFTER play)
    // ---------------------------------------------------------------------------
    useEffect(() => {
        // Skip if same command object (or initial ref)
        if (ttsCommand === lastCommandRef.current) return;
        lastCommandRef.current = ttsCommand;

        if (!ttsCommand.type) return;

        console.log('[useEpubTTS] Command received:', ttsCommand.type);

        if (ttsCommand.type === 'next') {
            const nextIndex = epubTTSController.getNextSentenceStart(currentCharIndex);
            if (nextIndex !== null) {
                console.log('[useEpubTTS] Skipping to next sentence:', nextIndex);
                if (synthRef.current) synthRef.current.cancel();
                play(undefined, nextIndex);
                epubTTSController.jumpToCharIndex(nextIndex); // Force view update
            } else {
                console.log('[useEpubTTS] Next sentence not found, trying next page');
                if (isAutoTurningRef) isAutoTurningRef.current = true;
                epubTTSController.nextPage();
            }
        } else if (ttsCommand.type === 'prev') {
            const prevIndex = epubTTSController.getPrevSentenceStart(currentCharIndex);
            console.log('[useEpubTTS] Skipping to prev sentence:', prevIndex);
            if (prevIndex !== null) {
                if (synthRef.current) synthRef.current.cancel();
                play(undefined, prevIndex);
                epubTTSController.jumpToCharIndex(prevIndex); // Force view update
            } else {
                console.log('[useEpubTTS] Prev sentence not found, trying prev page');
                if (synthRef.current) synthRef.current.cancel();
                // Navigate to previous page
                epubTTSController.prevPage();
            }
        }
    }, [ttsCommand, play, currentCharIndex]);

    // Register selection and page ready handlers
    useEffect(() => {
        // 获取当前文档
        const getCurrentDoc = (): Document | null => {
            const contents = renditionRef.current?.getContents?.();
            if (contents && contents.length > 0) {
                return contents[0].document;
            }
            return null;
        };

        // 更新 Resolver 的文档引用和模式
        const updateResolverState = () => {
            const doc = getCurrentDoc();
            if (doc) {
                readingEntryResolver.setDocument(doc);
                domOffsetResolver.setMode(useReaderStore.getState().readingMode);
            }
        };

        // 🎯 精确计算点击位置的 charOffset（句子级精度）
        const resolveClickOffset = (clickedNode: HTMLElement, doc: Document): number => {
            let charOffset = 0;
            const currentMode = useReaderStore.getState().readingMode;

            // 找到点击的句子节点
            const sentenceNode = clickedNode.closest('[data-sentence-id]') as HTMLElement | null;
            let targetNode = sentenceNode || clickedNode;

            // 🆕 Bilingual 模式特殊处理：如果点击的是译文，找到对应的原文
            if (currentMode === 'bilingual') {
                const isClickedTranslation = hasAncestorClass(targetNode, 'bbm-translated');
                if (isClickedTranslation && sentenceNode) {
                    // 获取句子 ID
                    const sentenceId = sentenceNode.dataset?.sentenceId;
                    if (sentenceId) {
                        // 尝试找到原文中相同 ID 的句子
                        const originalSentence = doc.querySelector(
                            `.bbm-original [data-sentence-id="${sentenceId}"], [data-sentence-id="${sentenceId}"]:not(.bbm-translated *)`
                        ) as HTMLElement | null;
                        if (originalSentence) {
                            targetNode = originalSentence;
                            console.log('[useEpubTTS] Bilingual: mapped translation click to original');
                        }
                    }
                }
            }

            // 获取所有句子节点
            const allSentences = doc.querySelectorAll('[data-sentence-id]');

            for (let i = 0; i < allSentences.length; i++) {
                const node = allSentences[i] as HTMLElement;

                // 根据模式过滤节点
                const isOriginal = hasAncestorClass(node, 'bbm-original');
                const isTranslated = hasAncestorClass(node, 'bbm-translated');

                // 根据模式跳过不相关的节点
                if (currentMode === 'translation' && isOriginal) continue;
                if (currentMode === 'original' && isTranslated) continue;
                if (currentMode === 'bilingual' && isTranslated) continue;

                // 找到目标节点
                if (node === targetNode || node.contains(targetNode) || targetNode.contains(node)) {
                    console.log('[useEpubTTS] Found click target at offset:', charOffset, 'mode:', currentMode);
                    return charOffset;
                }

                // 累加文本长度
                const text = sanitizeText(node.textContent || '');
                if (text && isValidText(text)) {
                    charOffset += text.length + 1;
                }
            }

            // 🆕 如果还是没找到，默认从 0 开始（而不是报警告）
            console.log('[useEpubTTS] Click target not found in filtered nodes, starting from 0');
            return 0;
        };

        // 🚨 统一点击处理（所有模式）
        epubTTSController.onSpeakTargetSelected = (target) => {
            const currentMode = useReaderStore.getState().readingMode;
            console.log('[useEpubTTS] SpeakTarget selected, mode:', currentMode);

            updateResolverState();
            isAutoTurningRef.current = false;

            const doc = getCurrentDoc();
            if (!doc || !target.node) {
                console.warn('[useEpubTTS] No doc or target node, fallback to offset 0');
                startSpeakFromOffset(0);
                return;
            }

            // 🎯 精确计算 charOffset（句子级）
            const charOffset = resolveClickOffset(target.node, doc);
            console.log('[useEpubTTS] Starting from charOffset:', charOffset);
            startSpeakFromOffset(charOffset);
        };

        // 旧版回调作为兜底
        epubTTSController.onTextSelected = (index, text) => {
            console.log('[useEpubTTS] Legacy text selection, index:', index);

            if (synthRef.current) synthRef.current.cancel();
            isAutoTurningRef.current = false;

            setCurrentCharIndex(index);
            setIsPlaying(true);
            wasPausedRef.current = false;

            play(text, index);
        };

        // 🆕 翻页后继续朗读（自动续读）
        epubTTSController.onPageReady = () => {
            console.log('[useEpubTTS] onPageReady');

            updateResolverState();
            isAutoTurningRef.current = false;

            // 🆕 使用 readerStore.tts.isPlaying 判断是否需要继续朗读
            if (useReaderStore.getState().tts.isPlaying) {
                console.log('[useEpubTTS] Page ready, continuing reading from offset 0');
                startSpeakFromOffset(0);
            }
        };

        return () => {
            epubTTSController.onSpeakTargetSelected = null;
            epubTTSController.onTextSelected = null;
            epubTTSController.onPageReady = null;
        };
    }, [play, startSpeakFromOffset, hasAncestorClass]);

    const pause = useCallback(() => {
        if (synthRef.current && isPlaying) {
            synthRef.current.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';

            // 🔴 禁用 TimelineHighlighter
            // timelineHighlighter.pause();

            setIsPaused(true);
            isAutoTurningRef.current = false;
            ttsPause();
            console.log('[useEpubTTS] Paused');
        }
    }, [isPlaying, ttsPause]);

    const resume = useCallback(() => {
        if (synthRef.current && isPaused) {
            synthRef.current.resume();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

            // 🔴 禁用 TimelineHighlighter
            // const currentTTS = useReaderStore.getState().tts;
            // timelineHighlighter.resume(currentTTS.rate || 1.0);

            setIsPaused(false);
            ttsPlay();
            console.log('[useEpubTTS] Resumed');
        }
    }, [isPaused, ttsPlay]);

    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';

            // 🔴 禁用 TimelineHighlighter
            // timelineHighlighter.stop();

            setIsPlaying(false);
            setIsPaused(false);
            setCurrentCharIndex(-1);
            isAutoTurningRef.current = false;
            epubTTSController.clearHighlights();
            ttsStop();
            console.log('[useEpubTTS] Stopped');
        }
    }, [ttsStop]);

    // Invalidate TTS session - call this when page/chapter changes
    // This cancels speech, clears highlights, and invalidates all pending callbacks
    // Unlike stop(), this is meant for page transitions where TTS should restart on new content
    const invalidate = useCallback((reason: string) => {
        console.log('[useEpubTTS] Invalidating TTS session:', reason);
        ttsSessionIdRef.current++;
        if (synthRef.current) {
            synthRef.current.cancel();
        }

        epubTTSController.clearHighlights();
        setCurrentCharIndex(-1);
    }, []);

    return {
        isPlaying,
        isPaused,
        currentCharIndex,
        play,
        pause,
        resume,
        stop,
        invalidate, // NEW: For page transitions
        setRendition,
        epubTTSController,
    };
}
