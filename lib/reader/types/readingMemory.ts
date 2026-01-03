/**
 * Reading Memory Types
 * 阅读记忆 - AI功能的落点，所有AI输出的仓库
 */

// 记忆项类型
export type ReadingMemoryType =
    | 'summary'      // AI 摘要
    | 'explanation'  // 术语解释
    | 'qa'           // 问答对
    | 'mindmap'      // 思维导图
    | 'highlight'    // 用户高亮
    | 'daily_review' // 每日自动总结

// 记忆项状态
export type ReadingMemoryStatus = 'pending' | 'confirmed' | 'deleted'

// 单条记忆项
export interface ReadingMemoryItem {
    id: string
    bookId: string
    type: ReadingMemoryType
    title: string           // 显示标题
    content: any            // 类型特定内容
    location?: {            // 位置信息
        cfi?: string
        chapterTitle?: string
        chapterIndex?: number
        page?: number
    }
    createdAt: Date
    status: ReadingMemoryStatus

    // 类型特定字段
    term?: string           // 术语解释时的术语
    question?: string       // 问答时的问题
    answer?: string         // 问答时的回答
    bulletPoints?: string[] // 摘要要点
    mindmapNodes?: any[]    // 思维导图节点
    highlightedText?: string // 高亮文本
}

// 阅读轨迹 - 记录当天阅读的内容
export interface ReadingTrack {
    bookId: string
    bookTitle: string
    date: string           // YYYY-MM-DD
    sessionStart: Date
    sessionEnd?: Date

    // 阅读内容积累
    readContent: string[]  // 每页/每章内容片段
    chaptersRead: string[] // 阅读的章节标题
    totalWords: number     // 总字数

    // 生成的总结
    dailySummary?: {
        generated: boolean
        content: string
        bulletPoints: string[]
    }
}

// Reading Memory Store 状态
export interface ReadingMemoryState {
    // 记忆项列表
    memories: ReadingMemoryItem[]

    // 当前阅读轨迹
    currentTrack: ReadingTrack | null

    // 加载状态
    isLoading: boolean

    // Actions
    addMemory: (memory: Omit<ReadingMemoryItem, 'id' | 'createdAt' | 'status'>) => void
    confirmMemory: (id: string) => void
    deleteMemory: (id: string) => void
    clearDeletedMemories: () => void

    // 阅读轨迹 Actions
    startReadingSession: (bookId: string, bookTitle: string) => void
    appendReadContent: (content: string, chapterTitle?: string) => void
    endReadingSession: () => Promise<void>

    // 加载/保存
    loadMemories: (bookId: string) => Promise<void>
    saveMemories: () => Promise<void>
}
