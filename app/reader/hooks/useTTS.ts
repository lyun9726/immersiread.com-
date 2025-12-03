/**
 * Hook for TTS functionality
 */

import { useRef, useEffect } from "react"
import { useReaderStore } from "../stores/readerStore"

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const tts = useReaderStore((state) => state.tts)
  const currentIndex = useReaderStore((state) => state.currentIndex)
  const blocks = useReaderStore((state) => state.blocks)
  const actions = useReaderStore((state) => ({
    ttsPlay: state.ttsPlay,
    ttsPause: state.ttsPause,
    ttsStop: state.ttsStop,
    setRate: state.setRate,
    setPitch: state.setPitch,
    setVoiceId: state.setVoiceId,
    setCurrentIndex: state.setCurrentIndex,
  }))

  // Update audio playbackRate when rate changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = tts.rate
    }
  }, [tts.rate])

  const synthesizeAndPlay = async () => {
    if (currentIndex >= blocks.length) {
      console.log("[useTTS] No more blocks to play")
      return
    }

    const currentBlock = blocks[currentIndex]

    try {
      const response = await fetch("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: currentBlock.id, text: currentBlock.text }],
          voiceId: tts.voiceId,
          rate: tts.rate,
          pitch: tts.pitch,
        }),
      })

      if (!response.ok) {
        throw new Error("TTS synthesis failed")
      }

      const data = await response.json()

      // Create audio element if doesn't exist
      if (!audioRef.current) {
        audioRef.current = new Audio()
      }

      // Set audio source and play
      audioRef.current.src = data.audioUrl
      audioRef.current.playbackRate = tts.rate

      await audioRef.current.play()

      actions.ttsPlay()

      // Listen for audio end
      audioRef.current.onended = () => {
        // Move to next block
        const nextIndex = currentIndex + 1
        if (nextIndex < blocks.length) {
          actions.setCurrentIndex(nextIndex)
          // Continue playing if still in playing state
          if (tts.isPlaying) {
            synthesizeAndPlay()
          }
        } else {
          actions.ttsStop()
        }
      }
    } catch (error) {
      console.error("[useTTS] Error:", error)
      actions.ttsPause()
      throw error
    }
  }

  const play = () => {
    synthesizeAndPlay()
  }

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    actions.ttsPause()
  }

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    actions.ttsStop()
  }

  const setRate = (rate: number) => {
    actions.setRate(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  }

  return {
    play,
    pause,
    stop,
    setRate,
    setPitch: actions.setPitch,
    setVoiceId: actions.setVoiceId,
    isPlaying: tts.isPlaying,
    rate: tts.rate,
    pitch: tts.pitch,
    voiceId: tts.voiceId,
  }
}
