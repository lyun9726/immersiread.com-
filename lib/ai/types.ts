/**
 * Reading Context - The heart of all AI features
 * All AI requests are bound to the current reading context
 */
export interface ReadingContext {
    // Document info
    docId: string;
    format: 'epub' | 'pdf' | 'text';
    language: string;

    // Location info
    currentLocation: {
        chapterId?: string;
        chapterTitle?: string;
        page?: number;
        cfi?: string;  // EPUB CFI
    };

    // Content info
    visibleText: string;      // Currently visible text on screen
    selectedText?: string;    // User-selected text

    // Optional extensions
    userNotes?: string[];
    recentParagraphs?: string[];
}

/**
 * AI Response types
 */
export interface AIExplainResponse {
    term: string;
    explanation: string;
    context?: string;
    error?: string;
}

export interface AISummaryResponse {
    summary: string;
    bulletPoints: string[];
    error?: string;
}

export interface AIMindmapResponse {
    title: string;
    nodes: MindmapNode[];
    error?: string;
}

export interface MindmapNode {
    id: string;
    text: string;
    children?: MindmapNode[];
}

export interface AIAskResponse {
    answer: string;
    sources?: string[];
    error?: string;
}

export type AIRequestType = 'explain' | 'summary' | 'mindmap' | 'ask';
