
/**
 * useEpubTTS - React hook for EPUB TTS with sync highlighting
 * 
 * 最终版架构（收尾版）：
 * - 唯一 Sentence Source：所有东西都只引用 sentence.id
 * - 点击朗读：只设置朗读起点，不做其他事情
 * - 高亮唯一入口：只通过 onboundary 事件来设置高亮
 * - charIndex → sentence 映射：使用简单的 for loop
 * 
 * ❌ 禁止使用 DOM index / span index / child index
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { epubTTSController } from '../controllers/EpubTTSController';
import { useReaderStore } from '../stores/readerStore';
import { buildTTSInput } from '@/lib/tts/polyphone';
import { sentenceRegistry, type Sentence } from '@/lib/tts/SentenceRegistry';
import { isValidText, sanitizeText } from '@/lib/tts/speakableTextResolver';

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

    // Store Actions
    const ttsPlay = useReaderStore((state) => state.ttsPlay);
    const ttsPause = useReaderStore((state) => state.ttsPause);
    const ttsStop = useReaderStore((state) => state.ttsStop);

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
     * 🆕 最终版：从指定句子开始朗读
     * 这是点击朗读的唯一入口
     * 
     * @param sentenceId - 起始句子的 ID
     */
    const speakFromSentence = useCallback((sentenceId: string) => {
        if (!synthRef.current) {
            console.error('[useEpubTTS] SpeechSynthesis not available');
            return;
        }

        if (epubTTSController.isTranslating()) {
            console.warn('[useEpubTTS] Blocked: translation in progress');
            return;
        }

        // 1️⃣ 取消当前朗读
        synthRef.current.cancel();

        // 2️⃣ 获取从该句子开始的所有句子
        const sentences = sentenceRegistry.getFrom(sentenceId);
        if (sentences.length === 0) {
            console.warn('[useEpubTTS] No sentences to speak');
            return;
        }

        // 3️⃣ 构建朗读文本
        const utteranceText = sentences.map(s => s.text).join(' ');
        if (!utteranceText.trim()) {
            console.warn('[useEpubTTS] Empty utterance text');
            return;
        }

        // 4️⃣ 增加 session ID
        ttsSessionIdRef.current++;
        const currentSession = ttsSessionIdRef.current;
        console.log('[useEpubTTS] speakFromSentence:', sentenceId, 'session:', currentSession);

        // 5️⃣ 创建 utterance
        const { speakText, decisions, hasPolyphones } = buildTTSInput(utteranceText);
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

        // 6️⃣ 高亮的唯一入口：onboundary
        utterance.onboundary = (event) => {
            if (ttsSessionIdRef.current !== currentSession) return;
            if (event.name !== 'word' && event.name !== 'sentence') return;

            const charIndex = event.charIndex;
            const currentSentence = sentenceRegistry.findByCharIndex(charIndex);

            if (currentSentence) {
                setActiveSentence(currentSentence.id);
                ensureVisible(currentSentence.id);
            }
        };

        utterance.onstart = () => {
            if (ttsSessionIdRef.current !== currentSession) return;
            setIsPlaying(true);
            setIsPaused(false);
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        };

        utterance.onend = () => {
            if (ttsSessionIdRef.current !== currentSession) return;
            console.log('[useEpubTTS] Utterance ended');

            // 清除高亮
            activeSentenceIdRef.current = null;
            epubTTSController.clearHighlights();

            // 尝试翻页
            if (!isAutoTurningRef.current) {
                isAutoTurningRef.current = true;
                epubTTSController.nextPage();
            }
        };

        utterance.onerror = (event) => {
            if (event.error !== 'interrupted') {
                console.error('[useEpubTTS] Error:', event.error);
                setIsPlaying(false);
                setIsPaused(false);
                epubTTSController.clearHighlights();
                ttsStop();
            }
        };

        // 7️⃣ 开始朗读
        setIsPlaying(true);
        setIsPaused(false);
        ttsPlay();
        synthRef.current.speak(utterance);

    }, [rate, pitch, voiceURI, ttsPlay, ttsStop, setActiveSentence, ensureVisible]);

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
        // 🆕 使用新的 SpeakTarget 回调
        epubTTSController.onSpeakTargetSelected = (target) => {
            console.log('[useEpubTTS] SpeakTarget selected:', target.sentenceId);

            // ❌ 绝对禁止：setHighlight() / setActiveSentence() / scrollIntoView()
            // 点击后 UI 什么都不高亮，是正确行为
            // 高亮只在 onboundary 中设置

            // 1️⃣ 只做一件事：设置朗读起点并开始朗读
            isAutoTurningRef.current = false;
            speakFromSentence(target.sentenceId);
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

        epubTTSController.onPageReady = () => {
            console.log('[useEpubTTS] onPageReady');

            // 提取并注册句子到 SentenceRegistry
            const contents = renditionRef.current?.getContents?.();
            if (contents && contents.length > 0) {
                const doc = contents[0].document;
                if (doc) {
                    sentenceRegistry.extractAndRegister(doc);
                }
            }

            // Reset auto-turn flag
            isAutoTurningRef.current = false;

            // 如果正在播放且没有句子，尝试从第一个句子开始
            if (useReaderStore.getState().tts.isPlaying) {
                const firstSentence = sentenceRegistry.getFirst();
                if (firstSentence) {
                    console.log('[useEpubTTS] Starting from first sentence');
                    speakFromSentence(firstSentence.id);
                } else {
                    // Fallback to legacy play
                    console.log('[useEpubTTS] No sentences, using legacy play');
                    play();
                }
            }
        };

        return () => {
            epubTTSController.onSpeakTargetSelected = null;
            epubTTSController.onTextSelected = null;
            epubTTSController.onPageReady = null;
        };
    }, [play, speakFromSentence]);

    const pause = useCallback(() => {
        if (synthRef.current && isPlaying) {
            synthRef.current.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';

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

            setIsPaused(false);
            ttsPlay();
            console.log('[useEpubTTS] Resumed');
        }
    }, [isPaused, ttsPlay]);

    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';

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
