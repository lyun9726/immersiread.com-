/**
 * Hook for Browser's built-in TTS (Web Speech API) - 100% FREE
 * No API keys required, works offline
 */

import { useRef, useEffect, useState } from "react"
import { useReaderStore } from "../stores/readerStore"

export function useBrowserTTS() {
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

    const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
    const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)
    const setCurrentBlockIndex = useReaderStore((state) => state.setCurrentBlockIndex)
    const tts = useReaderStore((state) => state.tts)

    // Load available voices
    useEffect(() => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return

        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices()
            setAvailableVoices(voices)
            console.log('[BrowserTTS] Available voices:', voices.length)
        }

        loadVoices()
        window.speechSynthesis.onvoiceschanged = loadVoices
    }, [])

    const selectVoice = (lang: string = 'en'): SpeechSynthesisVoice | null => {
        if (availableVoices.length === 0) return null

        // Try to find a voice matching the language
        const matchingVoice = availableVoices.find(voice =>
            voice.lang.toLowerCase().startsWith(lang.toLowerCase())
        )

        return matchingVoice || availableVoices[0]
    }

    const speak = (text: string, onEnd?: () => void) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            console.error('[BrowserTTS] Speech synthesis not supported')
            return
        }

        // Stop any current speech
        window.speechSynthesis.cancel()

        const utterance = new SpeechSynthesisUtterance(text)
        utteranceRef.current = utterance

        // Select voice based on text language (you could detect this automatically)
        const voice = selectVoice('en') // Default to English
        if (voice) {
            utterance.voice = voice
        }

        // Apply settings
        utterance.rate = tts.rate
        utterance.pitch = tts.pitch
        utterance.volume = 1.0

        utterance.onstart = () => {
            setIsSpeaking(true)
            console.log('[BrowserTTS] Started speaking')
        }

        utterance.onend = () => {
            setIsSpeaking(false)
            console.log('[BrowserTTS] Finished speaking')
            if (onEnd) onEnd()
        }

        utterance.onerror = (event) => {
            setIsSpeaking(false)
            console.error('[BrowserTTS] Speech error:', event.error)
        }

        window.speechSynthesis.speak(utterance)
    }

    const play = (blockIndex?: number) => {
        // Use provided index or current index from store
        const indexToPlay = blockIndex !== undefined ? blockIndex : currentBlockIndex

        if (indexToPlay >= enhancedBlocks.length) {
            console.log('[BrowserTTS] No more blocks to play')
            return
        }

        const currentBlock = enhancedBlocks[indexToPlay]

        // EnhancedBlock has 'original' property, not 'content'
        const textToSpeak = currentBlock.original

        console.log('[BrowserTTS] Playing block', indexToPlay, ':', textToSpeak.substring(0, 50))

        if (!textToSpeak || textToSpeak.trim().length === 0) {
            console.warn('[BrowserTTS] Empty text, skipping to next block')
            const nextIndex = indexToPlay + 1
            if (nextIndex < enhancedBlocks.length) {
                setCurrentBlockIndex(nextIndex)
                setTimeout(() => play(nextIndex), 100)
            }
            return
        }

        speak(textToSpeak, () => {
            // Move to next block when finished
            const nextIndex = indexToPlay + 1
            if (nextIndex < enhancedBlocks.length) {
                setCurrentBlockIndex(nextIndex)
                // Auto-continue to next block
                setTimeout(() => play(nextIndex), 100)
            }
        })
    }

    const pause = () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.pause()
            setIsSpeaking(false)
        }
    }

    const resume = () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.resume()
            setIsSpeaking(true)
        }
    }

    const stop = () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel()
            setIsSpeaking(false)
        }
    }

    return {
        play,
        pause,
        resume,
        stop,
        isSpeaking,
        availableVoices,
    }
}
