/**
 * Zustand store for Reader state management
 */

import { create } from "zustand"
import type { ReaderBlock, TranslationItem } from "@/lib/types"

interface TTSState {
  isPlaying: boolean
  rate: number
  pitch: number
  voiceId?: string
}

interface TranslationState {
  enabled: boolean
  targetLang?: string
  translatedMap: Record<string, string>
}

interface ReaderState {
  // Book data
  bookId: string | null
  blocks: ReaderBlock[]
  currentIndex: number
  mode: "scroll" | "paginate"

  // TTS state
  tts: TTSState

  // Translation state
  translation: TranslationState

  // Actions
  loadPreview: (previewBlocks: ReaderBlock[]) => void
  importBook: (bookId: string) => void
  setBlocks: (blocks: ReaderBlock[]) => void
  setCurrentIndex: (idx: number) => void
  setMode: (mode: "scroll" | "paginate") => void

  // TTS actions
  ttsPlay: () => void
  ttsPause: () => void
  ttsStop: () => void
  setRate: (rate: number) => void
  setPitch: (pitch: number) => void
  setVoiceId: (voiceId: string) => void

  // Translation actions
  translateBlocks: (items: TranslationItem[], targetLang: string) => Promise<void>
  setTranslationEnabled: (enabled: boolean) => void
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  // Initial state
  bookId: null,
  blocks: [],
  currentIndex: 0,
  mode: "scroll",

  tts: {
    isPlaying: false,
    rate: 1.0,
    pitch: 1.0,
    voiceId: "default",
  },

  translation: {
    enabled: false,
    targetLang: "zh",
    translatedMap: {},
  },

  // Actions
  loadPreview: (previewBlocks) => {
    set({
      blocks: previewBlocks,
      currentIndex: 0,
    })
  },

  importBook: (bookId) => {
    set({ bookId })
  },

  setBlocks: (blocks) => {
    set({ blocks, currentIndex: 0 })
  },

  setCurrentIndex: (idx) => {
    set({ currentIndex: idx })
  },

  setMode: (mode) => {
    set({ mode })
  },

  // TTS actions
  ttsPlay: () => {
    set((state) => ({
      tts: {
        ...state.tts,
        isPlaying: true,
      },
    }))
  },

  ttsPause: () => {
    set((state) => ({
      tts: {
        ...state.tts,
        isPlaying: false,
      },
    }))
  },

  ttsStop: () => {
    set((state) => ({
      tts: {
        ...state.tts,
        isPlaying: false,
      },
      currentIndex: 0,
    }))
  },

  setRate: (rate) => {
    set((state) => ({
      tts: {
        ...state.tts,
        rate,
      },
    }))
  },

  setPitch: (pitch) => {
    set((state) => ({
      tts: {
        ...state.tts,
        pitch,
      },
    }))
  },

  setVoiceId: (voiceId) => {
    set((state) => ({
      tts: {
        ...state.tts,
        voiceId,
      },
    }))
  },

  // Translation actions
  translateBlocks: async (items, targetLang) => {
    try {
      const response = await fetch("/api/translate/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, targetLang }),
      })

      if (!response.ok) {
        throw new Error("Translation failed")
      }

      const data = await response.json()

      // Update translated map
      const newMap: Record<string, string> = {}
      data.results.forEach((result: { id: string; translated: string }) => {
        newMap[result.id] = result.translated
      })

      set((state) => ({
        translation: {
          ...state.translation,
          translatedMap: {
            ...state.translation.translatedMap,
            ...newMap,
          },
          targetLang,
        },
      }))
    } catch (error) {
      console.error("[readerStore] Translation error:", error)
      throw error
    }
  },

  setTranslationEnabled: (enabled) => {
    set((state) => ({
      translation: {
        ...state.translation,
        enabled,
      },
    }))
  },
}))
