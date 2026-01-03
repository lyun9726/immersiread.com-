/**
 * Reading Memory Store
 * 阅读记忆存储 - 管理 AI 输出和阅读轨迹
 */

import { create } from 'zustand'
import type {
    ReadingMemoryItem,
    ReadingTrack,
    ReadingMemoryState,
    ReadingMemoryType
} from '../types/readingMemory'

// 生成唯一 ID
const generateId = () => `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// 获取今天的日期字符串
const getTodayString = () => new Date().toISOString().split('T')[0]

// localStorage key
const STORAGE_KEY = 'readai-reading-memory'

export const useReadingMemoryStore = create<ReadingMemoryState>((set, get) => ({
    memories: [],
    currentTrack: null,
    isLoading: false,

    // 添加记忆项
    addMemory: (memory) => {
        const newMemory: ReadingMemoryItem = {
            ...memory,
            id: generateId(),
            createdAt: new Date(),
            status: 'pending',
        }

        set((state) => ({
            memories: [newMemory, ...state.memories]
        }))

        // 自动保存
        get().saveMemories()

        console.log(`[ReadingMemory] Added: ${memory.type} - ${memory.title}`)
    },

    // 确认记忆项
    confirmMemory: (id) => {
        set((state) => ({
            memories: state.memories.map(m =>
                m.id === id ? { ...m, status: 'confirmed' as const } : m
            )
        }))
        get().saveMemories()
    },

    // 删除记忆项（软删除）
    deleteMemory: (id) => {
        set((state) => ({
            memories: state.memories.map(m =>
                m.id === id ? { ...m, status: 'deleted' as const } : m
            )
        }))
        get().saveMemories()
    },

    // 清除已删除的记忆
    clearDeletedMemories: () => {
        set((state) => ({
            memories: state.memories.filter(m => m.status !== 'deleted')
        }))
        get().saveMemories()
    },

    // 开始阅读会话
    startReadingSession: (bookId, bookTitle) => {
        const existingTrack = get().currentTrack

        // 如果已有同一本书的轨迹，继续累积
        if (existingTrack && existingTrack.bookId === bookId && existingTrack.date === getTodayString()) {
            console.log('[ReadingMemory] Continuing existing session')
            return
        }

        // 如果有其他书的轨迹，先结束它
        if (existingTrack && existingTrack.bookId !== bookId) {
            get().endReadingSession()
        }

        const newTrack: ReadingTrack = {
            bookId,
            bookTitle,
            date: getTodayString(),
            sessionStart: new Date(),
            readContent: [],
            chaptersRead: [],
            totalWords: 0,
        }

        set({ currentTrack: newTrack })
        console.log(`[ReadingMemory] Started session for: ${bookTitle}`)
    },

    // 追加阅读内容
    appendReadContent: (content, chapterTitle) => {
        if (!content || content.trim().length < 50) return // 忽略太短的内容

        set((state) => {
            if (!state.currentTrack) return state

            // 避免重复内容
            const existing = state.currentTrack.readContent
            const contentPreview = content.substring(0, 100)
            if (existing.some(c => c.startsWith(contentPreview))) {
                return state
            }

            const newChapters = chapterTitle && !state.currentTrack.chaptersRead.includes(chapterTitle)
                ? [...state.currentTrack.chaptersRead, chapterTitle]
                : state.currentTrack.chaptersRead

            return {
                currentTrack: {
                    ...state.currentTrack,
                    readContent: [...existing, content],
                    chaptersRead: newChapters,
                    totalWords: state.currentTrack.totalWords + content.length,
                }
            }
        })
    },

    // 结束阅读会话 - 生成每日总结
    endReadingSession: async () => {
        const track = get().currentTrack
        if (!track || track.readContent.length === 0) {
            console.log('[ReadingMemory] No content to summarize')
            return
        }

        console.log(`[ReadingMemory] Ending session, ${track.readContent.length} content pieces, ${track.totalWords} words`)

        // 合并所有阅读内容
        const allContent = track.readContent.join('\n\n').substring(0, 5000)

        try {
            // 调用 AI 生成每日总结
            const response = await fetch('/api/ai/daily-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookTitle: track.bookTitle,
                    content: allContent,
                    chaptersRead: track.chaptersRead,
                    totalWords: track.totalWords,
                })
            })

            const data = await response.json()

            if (!data.error) {
                // 保存每日总结到记忆
                get().addMemory({
                    bookId: track.bookId,
                    type: 'daily_review',
                    title: `${track.bookTitle} - 今日阅读`,
                    content: data.summary,
                    bulletPoints: data.bulletPoints,
                    location: {
                        chapterTitle: track.chaptersRead.join(', '),
                    }
                })

                console.log('[ReadingMemory] Daily summary generated and saved')
            } else {
                console.error('[ReadingMemory] Failed to generate daily summary:', data.error)
            }
        } catch (error) {
            console.error('[ReadingMemory] Error generating daily summary:', error)
        }

        // 清除当前轨迹
        set({ currentTrack: null })
    },

    // 从存储加载记忆
    loadMemories: async (bookId) => {
        set({ isLoading: true })

        try {
            // 从 localStorage 加载
            const stored = localStorage.getItem(`${STORAGE_KEY}-${bookId}`)
            if (stored) {
                const parsed = JSON.parse(stored)
                // 转换日期字符串为 Date 对象
                const memories: ReadingMemoryItem[] = parsed.map((m: any) => ({
                    ...m,
                    createdAt: new Date(m.createdAt)
                }))
                set({ memories })
                console.log(`[ReadingMemory] Loaded ${memories.length} memories for book ${bookId}`)
            }
        } catch (error) {
            console.error('[ReadingMemory] Failed to load memories:', error)
        } finally {
            set({ isLoading: false })
        }
    },

    // 保存记忆到存储
    saveMemories: async () => {
        const { memories } = get()
        if (memories.length === 0) return

        const bookId = memories[0]?.bookId
        if (!bookId) return

        try {
            localStorage.setItem(
                `${STORAGE_KEY}-${bookId}`,
                JSON.stringify(memories.filter(m => m.status !== 'deleted'))
            )
        } catch (error) {
            console.error('[ReadingMemory] Failed to save memories:', error)
        }
    },
}))

// 辅助函数：从 AI 功能自动保存到 Reading Memory
export const saveToReadingMemory = {
    summary: (bookId: string, bulletPoints: string[], chapterTitle?: string) => {
        useReadingMemoryStore.getState().addMemory({
            bookId,
            type: 'summary',
            title: chapterTitle ? `${chapterTitle} 摘要` : '本页摘要',
            content: bulletPoints.join('\n'),
            bulletPoints,
            location: { chapterTitle },
        })
    },

    explanation: (bookId: string, term: string, explanation: string) => {
        useReadingMemoryStore.getState().addMemory({
            bookId,
            type: 'explanation',
            title: term,
            content: explanation,
            term,
        })
    },

    qa: (bookId: string, question: string, answer: string, chapterTitle?: string) => {
        useReadingMemoryStore.getState().addMemory({
            bookId,
            type: 'qa',
            title: question.substring(0, 30) + (question.length > 30 ? '...' : ''),
            content: answer,
            question,
            answer,
            location: { chapterTitle },
        })
    },

    mindmap: (bookId: string, title: string, nodes: any[], chapterTitle?: string) => {
        useReadingMemoryStore.getState().addMemory({
            bookId,
            type: 'mindmap',
            title: `${title} 思维导图`,
            content: nodes,
            mindmapNodes: nodes,
            location: { chapterTitle },
        })
    },

    highlight: (bookId: string, text: string, cfi?: string, chapterTitle?: string) => {
        useReadingMemoryStore.getState().addMemory({
            bookId,
            type: 'highlight',
            title: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
            content: text,
            highlightedText: text,
            location: { cfi, chapterTitle },
        })
    },
}
