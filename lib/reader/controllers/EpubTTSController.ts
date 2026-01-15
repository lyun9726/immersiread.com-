/**
 * EpubTTSController - Manages TTS sync highlighting for EPUB reader
 * 
 * 新架构核心原则：
 * - 点击 = 设置朗读起点，不是朗读一个 node
 * - 每一页只认当前 iframe 内的 sentence
 * - 不依赖旧的 segment 复用（跨页必炸的问题源头）
 * 
 * Key responsibilities:
 * - Extract text from current EPUB page/chapter
 * - Map character indices to CFI ranges for precise highlighting
 * - Manage highlight annotations via direct DOM manipulation (Overlay)
 * - Handle auto-page-turn when reading reaches end of visible content
 */

import { SpeakTargetResolver, type SpeakTarget } from '@/lib/tts/SpeakTargetResolver';
import { injectSpeakableMarkers, clearSpeakableMarkers } from '@/lib/tts/injectSpeakableMarkers';

export interface TextSegment {
    text: string;
    startIndex: number;  // Character index in the full chapter text
    node: Node;          // The DOM text node
    cfi?: string;        // CFI for this text node (populated dynamically)
}

export interface EpubTTSState {
    isPlaying: boolean;
    currentCharIndex: number;
    currentSentenceStart: number;
    currentSentenceEnd: number;
}

export interface DebugState {
    lastCharIndex: number;
    segmentFound: boolean;
    segmentText: string;
    cfi: string;
    annotationCount: number;
    lastError: string;
    highlightAttempted: boolean;
    renditionReady: boolean;
    lastRect?: string; // Coordinate info for debugging
}

export class EpubTTSController {
    private rendition: any = null;
    private textSegments: TextSegment[] = [];
    private fullText: string = '';
    private currentHighlightCfi: string | null = null;
    private sentenceHighlightCfi: string | null = null;
    private lastHighlightedSentenceKey: string = ''; // To prevent redundant redraws
    private lastPageTurnTime: number = 0; // Debounce for page turns
    private userNavigatedAt: number = 0; // Track when user manually navigates
    private lastPlaybackCfi: string | null = null; // Track last TTS playback position for "return to" feature

    // 旧版 callback（保留兼容）
    public onTextSelected: ((charIndex: number, text: string) => void) | null = null;

    // 🆕 新版 callback - 基于 SpeakTarget
    public onSpeakTargetSelected: ((target: SpeakTarget) => void) | null = null;

    // Callback for page ready (after relocation and text extraction)
    public onPageReady: (() => void) | null = null;

    // Debug info
    private debugInfo: DebugState = {
        lastCharIndex: -1,
        segmentFound: false,
        segmentText: '',
        cfi: '',
        annotationCount: 0,
        lastError: '',
        highlightAttempted: false,
        renditionReady: false,
        lastRect: ''
    };

    /**
     * Get debug info for UI display
     */
    getDebugState(): DebugState {
        // Updated by drawHighlight manually now
        return { ...this.debugInfo };
    }

    private currentSpineIndex: number = -1;
    private lastTranslatedCount: number = 0; // Track translated elements count
    private forceNextExtraction: boolean = false; // Flag to force re-extraction
    private extractionDebounceTimer: any = null; // Debounce timer
    private lastHref: string = ''; // Track href for better change detection

    // Public flag to indicate TTS is auto-navigating (not user manual nav)
    public isAutoNavigating: boolean = false;

    // TTS Session ID - incremented on each page to invalidate stale callbacks
    private ttsSessionId: number = 0;

    // Page dirty flag - set on navigation, cleared after extraction
    private pageDirty: boolean = true;

    // 🆕 Translation state - TTS is BLOCKED when translation is in progress
    private _isTranslating: boolean = false;

    /**
     * Set translation status - TTS will be blocked while translating
     */
    setTranslating(translating: boolean) {
        console.log('[EpubTTSController] setTranslating:', translating);
        this._isTranslating = translating;
    }

    /**
     * Check if translation is in progress
     */
    isTranslating(): boolean {
        return this._isTranslating;
    }

    /**
     * Wait for page to be fully rendered (epub.js official recommended approach)
     * This ensures the iframe is ready before text extraction
     */
    waitForPageReady(): Promise<void> {
        return new Promise(resolve => {
            if (!this.rendition) {
                resolve();
                return;
            }

            let done = false;

            const onRendered = () => {
                if (done) return;
                done = true;
                cleanup();
                resolve();
            };

            const cleanup = () => {
                try {
                    this.rendition.off("rendered", onRendered);
                } catch (e) { }
            };

            this.rendition.on("rendered", onRendered);

            // Fallback timeout to prevent hanging
            setTimeout(() => {
                if (done) return;
                done = true;
                cleanup();
                console.log('[EpubTTSController] waitForPageReady fallback timeout');
                resolve();
            }, 800);
        });
    }

    /**
     * Get current TTS session ID
     */
    getSessionId(): number {
        return this.ttsSessionId;
    }

    /**
     * Invalidate current TTS session - call before page navigation
     * This increments sessionId, making all old callbacks stale
     */
    invalidateSession(reason: string): void {
        this.ttsSessionId++;
        console.log(`[EpubTTSController] Session invalidated (${reason}), new sessionId:`, this.ttsSessionId);
        this.clearHighlights();
        this.textSegments = [];
        this.fullText = '';
        this.pageDirty = true;
    }

    /**
     * Mark page as dirty (needs re-extraction)
     */
    markPageDirty(): void {
        this.pageDirty = true;
    }

    /**
     * Call this when user manually navigates (swipe, click arrows, etc.)
     * TTS will respect user's navigation for 3 seconds
     * Also clears cached text segments to prevent jumping back to old chapter
     */
    notifyUserNavigation(): void {
        this.userNavigatedAt = Date.now();

        // Clear cached segments so TTS won't try to jump back to old content
        // This is critical for allowing navigation to a new chapter during TTS
        this.textSegments = [];
        this.fullText = '';
        this.pageDirty = true;

        // Clear any existing highlights that might reference old content
        this.clearHighlights();

        console.log('[EpubTTSController] User navigation detected, cleared segments, pausing auto-page-turn for 3s');
    }

    /**
     * Check if page needs re-extraction
     */
    isPageDirty(): boolean {
        return this.pageDirty;
    }

    /**
     * Get the current TTS playback CFI position
     * Returns null if no position is available
     */
    getPlaybackCfi(): string | null {
        return this.lastPlaybackCfi;
    }

    /**
     * Jump to the current TTS playback position
     * Call this when user wants to return to where TTS is reading
     * Also re-extracts text and restores highlighting
     */
    async jumpToPlaybackPosition(): Promise<boolean> {
        if (!this.rendition || !this.lastPlaybackCfi) {
            console.log('[EpubTTSController] Cannot jump: no rendition or playback position');
            return false;
        }

        try {
            console.log('[EpubTTSController] Jumping to playback position:', this.lastPlaybackCfi.substring(0, 50));

            // Jump to the playback position
            await this.rendition.display(this.lastPlaybackCfi);

            // Reset user navigation timestamp so auto-page-turn resumes immediately
            this.userNavigatedAt = 0;

            // Wait a bit for the page to render
            await new Promise(resolve => setTimeout(resolve, 200));

            // Re-extract text for this page so highlighting and auto-page-turn work
            console.log('[EpubTTSController] Re-extracting text after jump back');
            this.pageDirty = true;
            await this.extractCurrentPageText();

            // Try to restore the highlight at the last playback position
            if (this.lastPlaybackCfi) {
                try {
                    // Find the segment for this CFI and redraw highlight
                    const segment = this.textSegments.find(s => s.cfi === this.lastPlaybackCfi);
                    if (segment) {
                        console.log('[EpubTTSController] Restoring highlight after jump back');
                        this.drawHighlight(segment.cfi!, 'word', segment);
                    }
                } catch (e) {
                    console.warn('[EpubTTSController] Could not restore highlight:', e);
                }
            }

            return true;
        } catch (e) {
            console.warn('[EpubTTSController] Failed to jump to playback position:', e);
            return false;
        }
    }

    /**
     * Force text re-extraction on next relocated event or immediately
     * Call this after instant translation completes
     */
    forceReExtract(immediate = false) {
        console.log('[EpubTTSController] Force re-extract requested, immediate:', immediate);
        this.forceNextExtraction = true;
        if (immediate && this.rendition) {
            // Only extract if we have content
            try {
                const contents = this.rendition.getContents();
                if (contents && contents.length > 0) {
                    this.extractCurrentPageText();
                } else {
                    console.log('[EpubTTSController] No contents available for immediate extraction');
                }
            } catch (e) {
                console.warn('[EpubTTSController] Could not get contents for immediate extraction');
            }
        }
    }

    // Bind listeners to class instance for removal
    private onRelocatedHandler = (location: any) => {
        // CRITICAL FIX (方案A): relocated handler ONLY does two things:
        // 1. Invalidate the current TTS session
        // 2. Mark page as dirty (needs re-extraction)
        // DO NOT: start extraction, TTS, or auto-advance here!

        const href = location?.start?.href || '';
        const idx = location?.start?.index ?? -1;

        console.log(`[EpubTTSController] Relocated: idx=${idx}, href=${href}`);

        // Mark page dirty - extraction must happen before TTS can start
        this.markPageDirty();
        this.currentSpineIndex = idx;
        this.lastHref = href;
    };

    private onClickHandler = (event: any, contents: any) => {
        this.handleTextClick(event, contents);
    }

    /**
     * Initialize controller with epub.js rendition
     */
    setRendition(rendition: any) {
        // Remove listeners from old rendition if exists and if it's different
        if (this.rendition && this.rendition !== rendition) {
            console.log('[EpubTTSController] Removing listeners from old rendition');
            try {
                this.rendition.off('relocated', this.onRelocatedHandler);
                this.rendition.off('click', this.onClickHandler);
            } catch (e) { console.warn('Failed to remove listeners', e); }
        }

        this.rendition = rendition;
        this.debugInfo.renditionReady = !!rendition;
        this.currentSpineIndex = -1; // Reset for new book
        this.lastHref = ''; // Reset href tracking

        // Add listeners
        // To be safe, try removing first (if same object)
        try {
            this.rendition.off('relocated', this.onRelocatedHandler);
            this.rendition.off('click', this.onClickHandler);
        } catch (e) { }

        console.log('[EpubTTSController] Adding listeners to rendition');
        this.rendition.on('relocated', this.onRelocatedHandler);
        this.rendition.on('click', this.onClickHandler);
    }

    /**
     * Handle click on text to start TTS
     * 
     * 新架构：点击 = 设置朗读起点
     * 使用 SpeakTargetResolver 解析点击位置，不依赖旧的 segment 缓存
     */
    private handleTextClick(event: any, contents: any) {
        console.log('[EpubTTSController] Click detected:', event.type);

        // 优先使用新版 callback
        if (this.onSpeakTargetSelected) {
            const target = SpeakTargetResolver.resolveFromEvent(event);
            if (target) {
                console.log('[EpubTTSController] SpeakTarget resolved:', target.sentenceId, target.text.substring(0, 50));
                this.onSpeakTargetSelected(target);
                return;
            }
            console.log('[EpubTTSController] No SpeakTarget found, falling back to full page text');
        }

        // 兜底：使用旧版 callback（兼容）
        if (!this.onTextSelected) {
            console.log('[EpubTTSController] No callback registered');
            return;
        }

        // 使用 SpeakTargetResolver 获取点击位置的文本
        const target = SpeakTargetResolver.resolveFromEvent(event);
        if (target) {
            console.log('[EpubTTSController] Resolved target text:', target.text.substring(0, 50));
            // 旧版 callback 需要 charIndex，这里用 0 表示从头开始
            // 实际文本直接传递 target.text
            this.onTextSelected(0, target.text);
            return;
        }

        // 如果 SpeakTargetResolver 也没找到，尝试获取整页文本
        console.log('[EpubTTSController] No target found, extracting full page text');
        this.extractCurrentPageText().then(() => {
            if (this.fullText && this.onTextSelected) {
                this.onTextSelected(0, this.fullText);
            }
        });
    }

    /**
     * Extract text from current visible EPUB content
     */
    async extractCurrentPageText(): Promise<string> {
        console.log('[EpubTTSController] extractCurrentPageText called');

        if (!this.rendition) {
            console.error('[EpubTTSController] No rendition set!');
            return '';
        }

        // Try different methods to get contents
        let contents: any[] = [];
        try {
            contents = this.rendition.getContents();
        } catch (e) {
            console.error('[EpubTTSController] getContents() failed:', e);
        }

        if (!contents || contents.length === 0) {
            try {
                const manager = this.rendition.manager;
                if (manager && manager.views && manager.views._views) {
                    contents = manager.views._views.map((v: any) => v.contents);
                }
            } catch (e) { }
        }

        if (!contents || contents.length === 0) {
            console.error('[EpubTTSController] No contents available');
            return '';
        }

        const content = contents[0];
        const doc = content?.document;

        if (!doc || !doc.body) {
            return '';
        }

        this.textSegments = [];
        this.fullText = '';
        let currentIndex = 0;

        // Get current reading mode from store to filter content appropriately
        const readingMode = (typeof window !== 'undefined' && (window as any).__READING_MODE__) || 'bilingual';
        console.log('[EpubTTSController] Extracting text with readingMode:', readingMode);

        // Walk through all text nodes
        const walker = doc.createTreeWalker(
            doc.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node: Node) => {
                    const text = node.textContent?.trim() || '';
                    if (!text) return NodeFilter.FILTER_REJECT;
                    const parent = node.parentElement;
                    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    // Check if this node is inside a bilingual content block
                    // Look up the tree for bbm-original or bbm-translated classes
                    let ancestor = parent;
                    let isOriginal = false;
                    let isTranslated = false;

                    while (ancestor && ancestor !== doc.body) {
                        if (ancestor.classList?.contains('bbm-original')) {
                            isOriginal = true;
                            break;
                        }
                        if (ancestor.classList?.contains('bbm-translated')) {
                            isTranslated = true;
                            break;
                        }
                        ancestor = ancestor.parentElement;
                    }

                    // Filter based on reading mode
                    if (readingMode === 'translation') {
                        // Only read translated content
                        if (isOriginal) return NodeFilter.FILTER_REJECT;
                        // If it's translated or has no special class, accept
                    } else if (readingMode === 'original') {
                        // Only read original content
                        if (isTranslated) return NodeFilter.FILTER_REJECT;
                    }
                    // For 'bilingual' mode, accept everything

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node: Node | null;
        while ((node = walker.nextNode())) {
            const text = node.textContent || '';
            const trimmedText = text.trim();

            if (trimmedText) {
                let cfi: string | undefined;
                try {
                    cfi = content.cfiFromNode(node);
                } catch (e) { }

                this.textSegments.push({
                    text: trimmedText,
                    startIndex: currentIndex,
                    node: node,
                    cfi: cfi,
                });

                this.fullText += trimmedText + ' ';
                currentIndex += trimmedText.length + 1;
            }
        }

        console.log('[EpubTTSController] Extracted text segments:', this.textSegments.length, 'mode:', readingMode);

        return this.fullText.trim();
    }

    /**
     * Get current spine (chapter) index
     */
    getCurrentSpineIndex(): number {
        return this.currentSpineIndex;
    }

    /**
     * Find segment that contains the CFI (if possible)
     */
    findSegmentFromCfi(cfi: string): TextSegment | null {
        return this.textSegments.find(s => s.cfi === cfi) || null;
    }

    /**
     * Find the character index corresponding to a given CFI
     * Used for restoring playback position from saved progress
     * Uses DOM Range comparison for robustness AND Text fallback
     */
    findCharIndexFromCfi(cfi: string, textSnippet?: string): number {
        if (!cfi && !textSnippet) return -1;
        if (this.textSegments.length === 0) return -1;

        // 1. Try exact match first (Fastest)
        const segment = this.textSegments.find(s => s.cfi === cfi);
        if (segment) return segment.startIndex;

        // 2. Try DOM Range Match (Robust)
        if (this.rendition && cfi) {
            try {
                // Determine if we can get a range
                // Note: getRange might throw if CFI is invalid for this chapter
                const range = this.rendition.getRange(cfi);
                if (range) {
                    const node = range.startContainer;

                    // If node is Text, check if it matches any segment node
                    if (node.nodeType === Node.TEXT_NODE) {
                        const match = this.textSegments.find(s => s.node === node);
                        if (match) {
                            console.log('[EpubTTSController] Matched CFI via DOM Range (TextNode)');
                            // Return index + offset
                            return match.startIndex + range.startOffset;
                        }
                    }
                    // If node is Element, it might contain the text node
                    // We try to find the first segment that is a descendant of this node
                    else {
                        const match = this.textSegments.find(s => node.contains(s.node));
                        if (match) {
                            console.log('[EpubTTSController] Matched CFI via DOM Range (Element)');
                            return match.startIndex;
                        }
                    }
                }
            } catch (e) {
                console.warn('[EpubTTSController] CFI Range match failed:', e);
            }
        }

        // 3. Fallback: Text Snippet Match (Super Memory)
        if (textSnippet) {
            const cleanSnippet = textSnippet.trim().substring(0, 30); // Use first 30 chars
            if (cleanSnippet.length > 5) {
                const match = this.textSegments.find(s => s.text.includes(cleanSnippet) || cleanSnippet.includes(s.text));
                if (match) {
                    console.log('[EpubTTSController] Matched via Text Snippet (Super Memory)');
                    return match.startIndex;
                }
            }
        }

        console.warn(`[EpubTTSController] Could not find segment for CFI: ${cfi}`);
        return -1;
    }

    /**
     * Get the full text of current page for TTS
     */
    getFullText(): string {
        return this.fullText;
    }

    /**
     * Get text snippet at character index (Public)
     * Returns text FROM the current position (not the whole segment)
     */
    getTextForCharIndex(charIndex: number): string | null {
        const segment = this.findSegmentForCharIndex(charIndex);
        if (!segment) return null;

        // Calculate offset within the segment
        const offset = Math.max(0, charIndex - segment.startIndex);
        // Return text from current reading position
        return segment.text.substring(offset);
    }

    /**
     * Get CFI for character index (Public)
     */
    getCfiForCharIndex(charIndex: number): string | null {
        const segment = this.findSegmentForCharIndex(charIndex);
        return segment && segment.cfi ? segment.cfi : null;
    }

    private findSegmentForCharIndex(charIndex: number): TextSegment | null {
        for (const segment of this.textSegments) {
            const segmentEnd = segment.startIndex + segment.text.length;
            if (charIndex >= segment.startIndex && charIndex < segmentEnd) {
                return segment;
            }
        }
        return null;
    }

    /**
     * 🆕 核心方法：判断 charOffset 对应的 DOM 节点是否在 viewport 内
     * 这是章节内翻页的唯一判断依据
     * 
     * 来源：专业阅读器的正确做法
     * - 不是判断高亮位置
     * - 不是判断 scrollTop
     * - 而是判断「阅读游标」指向的字符所在的 DOM 节点是否可见
     */
    isCharOffsetVisible(charOffset: number): boolean {
        if (!this.rendition) {
            return true;
        }

        const segment = this.findSegmentForCharIndex(charOffset);
        if (!segment || !segment.cfi) {
            return true;
        }

        try {
            // 🆕 使用 epub.js 的 currentLocation API
            // 这会返回当前可见页面的 CFI 范围
            const location = this.rendition.currentLocation();
            if (!location || !location.start || !location.end) {
                return true;
            }

            // 获取当前可见范围的 CFI
            const startCfi = location.start.cfi;
            const endCfi = location.end.cfi;

            // 使用 epub.js 的 CFI 比较功能
            // 如果 segment.cfi 在 [startCfi, endCfi] 范围内，则可见
            const epubcfi = new (this.rendition.book.spine as any).epubcfi();

            const segmentCfiValue = epubcfi.parse(segment.cfi);
            const startCfiValue = epubcfi.parse(startCfi);
            const endCfiValue = epubcfi.parse(endCfi);

            // 比较 CFI：如果 segment CFI >= start CFI 且 <= end CFI，则可见
            const afterStart = epubcfi.compare(segment.cfi, startCfi) >= 0;
            const beforeEnd = epubcfi.compare(segment.cfi, endCfi) <= 0;
            const isVisible = afterStart && beforeEnd;

            console.log(`[EpubTTSController] isCharOffsetVisible(${charOffset}): cfi compare -> ${isVisible} (afterStart=${afterStart}, beforeEnd=${beforeEnd})`);

            return isVisible;
        } catch (e) {
            // 如果 CFI 比较失败，fallback 到 DOM 检测
            console.warn('[EpubTTSController] CFI compare failed, falling back to DOM:', e);
            return this.isCharOffsetVisibleByDOM(charOffset);
        }
    }

    /**
     * Fallback: 使用 DOM 位置检测可见性
     */
    private isCharOffsetVisibleByDOM(charOffset: number): boolean {
        const segment = this.findSegmentForCharIndex(charOffset);
        if (!segment || !segment.node) return true;

        try {
            const view = this.rendition?.getContents()[0];
            const doc = view?.document;
            const win = view?.window;

            if (!doc || !win) return true;
            if (!doc.contains(segment.node)) return false;

            const localOffset = charOffset - segment.startIndex;
            const nodeText = segment.node.textContent || '';

            const range = doc.createRange();
            const startPos = Math.min(localOffset, nodeText.length - 1);
            const endPos = Math.min(startPos + 3, nodeText.length);

            try {
                range.setStart(segment.node, Math.max(0, startPos));
                range.setEnd(segment.node, endPos);
            } catch (e) {
                range.selectNodeContents(segment.node);
            }

            const rect = range.getBoundingClientRect();
            if (!rect || rect.width === 0) return true;

            const viewportWidth = win.innerWidth;
            const viewportHeight = win.innerHeight;

            const isWithinX = rect.left >= -50 && rect.left <= viewportWidth + 50;
            const isWithinY = rect.top >= -50 && rect.bottom <= viewportHeight + 50;

            return isWithinX && isWithinY;
        } catch (e) {
            return true;
        }
    }

    /**
     * 辅助方法：获取文本节点的位置
     */
    private getNodeRect(node: Node, doc: Document): DOMRect | null {
        try {
            const range = doc.createRange();
            range.selectNodeContents(node);
            return range.getBoundingClientRect();
        } catch (e) {
            return null;
        }
    }

    /**
     * 🆕 翻到下一个可见 block
     * 翻页后什么都不做：不 cancel TTS，不重新提取文本
     * 声音继续，页面追着声音走
     */
    turnToNextVisibleBlock(charOffset: number): void {
        if (!this.rendition) return;

        // 防抖：300ms 内不重复翻页
        const now = Date.now();
        if (now - this.lastPageTurnTime < 300) {
            return;
        }

        // 找到 charOffset 对应的 segment
        const segment = this.findSegmentForCharIndex(charOffset);
        if (!segment || !segment.cfi) {
            // 如果找不到 cfi，直接翻到下一页
            console.log('[EpubTTSController] turnToNextVisibleBlock: no cfi, using next()');
            this.lastPageTurnTime = now;
            this.rendition.next();
            return;
        }

        // 使用 display(cfi) 翻到包含该内容的页面
        console.log('[EpubTTSController] turnToNextVisibleBlock: jumping to cfi');
        this.lastPageTurnTime = now;
        this.rendition.display(segment.cfi);
    }

    /**
     * 🆕 章节内翻页的入口方法
     * 只有当 charOffset 不可见时才翻页
     */
    checkAndTurnPage(charOffset: number): void {
        if (!this.isCharOffsetVisible(charOffset)) {
            console.log(`[EpubTTSController] charOffset ${charOffset} not visible, turning page`);
            this.turnToNextVisibleBlock(charOffset);
        }
    }

    /**
     * 🆕 Find charIndex (startIndex) for a clicked DOM node
     * This method bridges the gap between DOM click events and textSegments offset system
     * 
     * @param clickedNode - The DOM node that was clicked
     * @returns The startIndex in textSegments, or 0 if not found
     */
    findCharIndexForNode(clickedNode: Node): number {
        if (this.textSegments.length === 0) {
            console.warn('[EpubTTSController] textSegments is empty, cannot find charIndex');
            return 0;
        }

        // Strategy 1: Direct match - clickedNode IS a text segment node
        const directMatch = this.textSegments.find(s => s.node === clickedNode);
        if (directMatch) {
            console.log('[EpubTTSController] findCharIndexForNode: Direct match found');
            return directMatch.startIndex;
        }

        // Strategy 2: clickedNode contains a text segment node
        const containsMatch = this.textSegments.find(s => clickedNode.contains(s.node));
        if (containsMatch) {
            console.log('[EpubTTSController] findCharIndexForNode: Contains match found');
            return containsMatch.startIndex;
        }

        // Strategy 3: clickedNode is contained by a text segment's parent
        // This handles cases where user clicks on a span inside a paragraph
        for (const segment of this.textSegments) {
            if (segment.node.parentElement?.contains(clickedNode)) {
                console.log('[EpubTTSController] findCharIndexForNode: Parent contains match found');
                return segment.startIndex;
            }
        }

        // Strategy 4: Text content match - find segment with matching text
        const clickedText = clickedNode.textContent?.trim();
        if (clickedText && clickedText.length > 5) {
            const textMatch = this.textSegments.find(s =>
                s.text.includes(clickedText.substring(0, 20)) ||
                clickedText.includes(s.text.substring(0, 20))
            );
            if (textMatch) {
                console.log('[EpubTTSController] findCharIndexForNode: Text content match found');
                return textMatch.startIndex;
            }
        }

        console.warn('[EpubTTSController] findCharIndexForNode: No match found, returning 0');
        return 0;
    }

    /**
     * Find sentence boundaries around a character index
     */
    private findSentenceBoundaries(charIndex: number): { start: number; end: number } {
        // Clamp index to 0
        const index = Math.max(0, charIndex);

        const sentenceEndPattern = /[。？！.?!]/;

        if (!this.fullText) return { start: 0, end: 0 };

        // Find start (go back to previous sentence end or start of text)
        let start = index;
        while (start > 0 && !sentenceEndPattern.test(this.fullText[start - 1])) {
            start--;
        }

        // Find end (go forward to next sentence end)
        let end = index;
        while (end < this.fullText.length && !sentenceEndPattern.test(this.fullText[end])) {
            end++;
        }
        // Include the punctuation
        if (end < this.fullText.length) end++;

        return { start, end };
    }

    /**
     * Helper to get/create highlight layer
     */
    private getHighlightLayer() {
        if (!this.rendition) return null;
        try {
            const view = this.rendition.getContents()[0];
            if (!view) return null;
            const doc = view.document;
            const body = doc.body;

            let container = doc.getElementById('tts-highlight-layer');
            if (!container) {
                container = doc.createElement('div');
                container.id = 'tts-highlight-layer';
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.pointerEvents = 'none';
                container.style.zIndex = '100';
                container.style.overflow = 'visible';
                body.appendChild(container);
            }
            return container;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    /**
     * Draw highlight manually using absolute positioned divs
     */
    private drawHighlight(cfi: string, type: 'word' | 'sentence', segment?: TextSegment, charIndex?: number, length?: number): void {
        if (!this.rendition) return;

        try {
            const view = this.rendition.getContents()[0];
            if (!view) return;
            const doc = view.document;
            const container = this.getHighlightLayer();
            if (!container) return;

            // Strategy: Try to use Node directly if available, fallback to CFI
            let range: Range | null = null;

            if (segment && segment.node) {
                try {
                    // CRITICAL: Check if node is still in document before using it
                    // After navigation, old nodes are removed and this check prevents errors
                    if (!doc.contains(segment.node)) {
                        console.log('[EpubTTSController] Node no longer in document, skipping highlight');
                        return; // Node from previous page - skip highlighting
                    }

                    range = doc.createRange();
                    if (charIndex !== undefined) {
                        // Sub-range logic
                        const startOffset = Math.max(0, charIndex - segment.startIndex);
                        const nodeText = segment.node.textContent || '';
                        let len = length || 1;
                        const endOffset = Math.min(nodeText.length, startOffset + len);

                        if (startOffset < nodeText.length) {
                            range.setStart(segment.node, startOffset);
                            range.setEnd(segment.node, endOffset);
                        } else {
                            range.selectNodeContents(segment.node);
                        }
                    } else {
                        range.selectNodeContents(segment.node);
                    }
                } catch (e) {
                    console.warn('[EpubTTSController] Error creating range from node:', e);
                    range = null; // Fallback to CFI
                }
            }

            if (!range) {
                try { range = this.rendition.getRange(cfi); } catch (e) { }
            }
            if (!range) return;

            // Clear existing WORD highlights only (sentence highlights managed separately now)
            if (type === 'word') {
                const existing = container.querySelectorAll(`.tts-manual-word`);
                existing.forEach(el => el.remove());
            }

            // Get rects
            const rects = range.getClientRects();
            const win = doc.defaultView || doc.parentWindow;
            const scrollX = win.pageXOffset || doc.documentElement.scrollLeft;
            const scrollY = win.pageYOffset || doc.documentElement.scrollTop;

            if (type === 'word' && rects.length > 0) {
                this.debugInfo.lastRect = `L:${Math.round(rects[0].left)} T:${Math.round(rects[0].top)} W:${Math.round(rects[0].width)}`;
            }

            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i];
                if (rect.width === 0 || rect.height === 0) continue;

                const div = doc.createElement('div');
                div.className = `tts-manual-${type}`;

                div.style.position = 'absolute';
                div.style.left = `${rect.left + scrollX}px`;
                div.style.top = `${rect.top + scrollY}px`;
                div.style.width = `${rect.width}px`;
                div.style.height = `${rect.height}px`;
                div.style.pointerEvents = 'none';

                if (type === 'word') {
                    div.style.borderBottom = '3px solid orange';
                    div.style.backgroundColor = 'rgba(255, 152, 0, 0.3)';
                    div.style.borderRadius = '2px';
                    div.style.zIndex = '10';
                } else {
                    // This branch might not be used if we use drawSentenceHighlights
                    div.style.backgroundColor = 'rgba(255, 235, 59, 0.4)';
                    div.style.zIndex = '5';
                }

                container.appendChild(div);
            }

            this.debugInfo.annotationCount = container.children.length;

        } catch (e: any) {
            console.error('[EpubTTSController] Draw highlight error:', e);
            this.debugInfo.lastError = 'Draw err: ' + e.message;
        }
    }

    /**
     * Draw HIGHLIGHTS for a full sentence spanning multiple segments
     */
    private drawSentenceHighlights(segments: TextSegment[], globalStart: number, globalEnd: number) {
        if (!this.rendition) return;

        try {
            const view = this.rendition.getContents()[0];
            if (!view) return;
            const doc = view.document;
            const container = this.getHighlightLayer();
            if (!container) return;

            // Clear previous sentence highlights
            const existing = container.querySelectorAll(`.tts-manual-sentence`);
            existing.forEach(el => el.remove());

            const win = doc.defaultView || doc.parentWindow;
            const scrollX = win.pageXOffset || doc.documentElement.scrollLeft;
            const scrollY = win.pageYOffset || doc.documentElement.scrollTop;

            // Render each segment
            segments.forEach(seg => {
                if (!seg.node) return;

                // CRITICAL: Check if node is still in document
                if (!doc.contains(seg.node)) {
                    return; // Node from previous page - skip
                }

                try {
                    const range = doc.createRange();

                    // Calculate intersection of segment and sentence
                    const segStart = seg.startIndex;
                    const segEnd = seg.startIndex + seg.text.length;

                    // Local offsets relative to node
                    const localStart = Math.max(0, globalStart - segStart);
                    const localEnd = Math.min(seg.text.length, globalEnd - segStart);

                    if (localStart < localEnd) {
                        range.setStart(seg.node, localStart);
                        range.setEnd(seg.node, localEnd);

                        const rects = range.getClientRects();

                        for (let i = 0; i < rects.length; i++) {
                            const rect = rects[i];
                            if (rect.width === 0 || rect.height === 0) continue;

                            const div = doc.createElement('div');
                            div.className = 'tts-manual-sentence';
                            div.style.position = 'absolute';
                            div.style.left = `${rect.left + scrollX}px`;
                            div.style.top = `${rect.top + scrollY}px`;
                            div.style.width = `${rect.width}px`;
                            div.style.height = `${rect.height}px`;
                            div.style.pointerEvents = 'none';
                            div.style.backgroundColor = 'rgba(255, 235, 59, 0.4)';
                            div.style.borderRadius = '3px';
                            div.style.mixBlendMode = 'multiply';
                            div.style.zIndex = '5';

                            container.appendChild(div);
                        }
                    }
                } catch (e) {
                    console.warn('[EpubTTSController] Error in sentence highlight:', e);
                }
            });
            this.debugInfo.annotationCount = container.children.length;

        } catch (e) {
            console.error(e);
        }
    }

    private cleanupOverlay() {
        if (!this.rendition) return;
        try {
            const view = this.rendition.getContents()[0];
            if (!view) return;
            const doc = view.document;
            const container = doc.getElementById('tts-highlight-layer');
            if (container) container.remove();
        } catch (e) {
            // Ignore
        }
    }

    /**
     * Update word highlight based on current TTS charIndex
     * Also checks visibility and triggers page turn if needed
     */
    async highlightWord(charIndex: number, charLength?: number): Promise<void> {
        this.debugInfo.lastCharIndex = charIndex;
        this.debugInfo.highlightAttempted = true;
        this.debugInfo.lastError = '';

        if (!this.rendition) {
            this.debugInfo.lastError = 'No rendition';
            return;
        }

        const segment = this.findSegmentForCharIndex(charIndex);
        if (!segment) {
            this.debugInfo.segmentFound = false;
            return;
        }

        // Check if segment's node is still in the document (user may have navigated away)
        if (segment.node) {
            const view = this.rendition.getContents()[0];
            const doc = view?.document;
            if (doc && !doc.contains(segment.node)) {
                this.debugInfo.segmentFound = false;
                this.debugInfo.lastError = 'Node not in document (user navigated?)';
                return;
            }
        }

        this.debugInfo.segmentFound = true;
        this.debugInfo.segmentText = segment.text;

        if (!segment.cfi) {
            this.debugInfo.cfi = 'none';
            return;
        }

        this.debugInfo.cfi = segment.cfi;

        try {
            this.drawHighlight(segment.cfi, 'word', segment, charIndex, charLength);
            this.currentHighlightCfi = segment.cfi;

            // Update last playback position for "return to" feature
            this.lastPlaybackCfi = segment.cfi;

            // CRITICAL: Check visibility with precise char position
            // This ensures page turns happen even within long paragraphs
            this.ensureHighlightVisible(segment, charIndex);
        } catch (error: any) {
            console.warn('[EpubTTSController] Error highlighting word:', error);
        }
    }

    /**
     * Highlight the current sentence
     */
    async highlightSentence(charIndex: number): Promise<void> {
        if (!this.rendition) return;

        const { start, end } = this.findSentenceBoundaries(charIndex);
        const sentenceKey = `${start}-${end}`;

        // Avoid redrawing if we are in the same sentence
        if (this.lastHighlightedSentenceKey === sentenceKey) {
            return;
        }
        this.lastHighlightedSentenceKey = sentenceKey;

        // Find all segments that belong to this sentence
        const sentenceSegments = this.textSegments.filter(seg => {
            const segEnd = seg.startIndex + seg.text.length;
            return segEnd > start && seg.startIndex < end;
        });

        if (sentenceSegments.length === 0) return;

        try {
            // Use new multi-segment drawer
            this.drawSentenceHighlights(sentenceSegments, start, end);

            // Ensure visibility at the start of the sentence
            if (sentenceSegments[0]) {
                this.ensureHighlightVisible(sentenceSegments[0]);
            }
        } catch (error) {
            console.warn('[EpubTTSController] Error highlighting sentence:', error);
        }
    }

    /**
     * Unconditionally jump to the segment for the given charIndex
     * Used for Manual "Next" / "Prev" commands
     */
    async jumpToCharIndex(charIndex: number): Promise<void> {
        const segment = this.findSegmentForCharIndex(charIndex);
        if (segment && segment.cfi && this.rendition) {
            console.log('[EpubTTSController] Forcing jump to segment:', segment.cfi);
            try {
                await this.rendition.display(segment.cfi);
            } catch (e) {
                console.error(e);
            }
        }
    }

    /**
     * Ensure the highlighted element is visible
     * In paginated mode, epub.js uses CSS columns - invisible content is offset horizontally (X axis)
     * Now accepts charIndex to create a precise range for the current word position
     */
    private ensureHighlightVisible(segment: TextSegment, charIndex?: number): void {
        if (!this.rendition || !segment.cfi) return;

        // Respect user's manual navigation for 3 seconds
        const now = Date.now();
        if (now - this.userNavigatedAt < 3000) {
            return; // User recently navigated, don't override
        }

        try {
            const view = this.rendition.getContents()[0];
            const win = view?.window;
            const doc = view?.document;

            if (!win || !doc) return;

            let rect: DOMRect | null = null;

            // Try to create a precise range for the current character position
            if (segment.node && charIndex !== undefined && doc.contains(segment.node)) {
                try {
                    const localOffset = charIndex - segment.startIndex;
                    const nodeText = segment.node.textContent || '';

                    if (localOffset >= 0 && localOffset < nodeText.length) {
                        // Create a range for just a few characters at the current position
                        const range = doc.createRange();
                        const startPos = Math.max(0, localOffset);
                        const endPos = Math.min(nodeText.length, localOffset + 5);
                        range.setStart(segment.node, startPos);
                        range.setEnd(segment.node, endPos);
                        rect = range.getBoundingClientRect();
                    }
                } catch (e) {
                    // Fall back to segment CFI
                }
            }

            // Fallback: use the segment's CFI range
            if (!rect || rect.width === 0) {
                // 🆕 关键修复：如果 segment.node 不在 document 中，
                // 这意味着内容在**下一页**，需要翻页！
                // 之前的逻辑是"跳过"，这是错误的
                if (segment.node && !doc.contains(segment.node)) {
                    console.log('[EpubTTS] Segment node not in document - turning to next page');

                    // Apply debounce
                    if (now - this.lastPageTurnTime < 300) {
                        return;
                    }

                    this.lastPageTurnTime = now;
                    this.rendition.next(); // 翻到下一页
                    return;
                }

                const range = this.rendition.getRange(segment.cfi);
                if (!range) {
                    // Can't get range - DON'T force display, user may have navigated away
                    // Only log for debugging, don't try to jump back
                    console.log('[EpubTTS] No range for CFI, segment may be from old chapter');
                    return;
                }
                rect = range.getBoundingClientRect();
            }

            if (!rect) return;

            const width = win.innerWidth;
            const height = win.innerHeight;

            // In paginated mode (CSS columns), content on other "pages" has X coordinates
            // that are either negative (previous pages) or greater than viewport width (next pages)
            const x = rect.left;
            const y = rect.top;

            // Debug info
            this.debugInfo.lastRect = `x:${Math.round(x)} y:${Math.round(y)} w:${width} h:${height}`;

            // Check visibility using X coordinate (primary) and Y as secondary
            const xVisible = x >= -50 && x < width + 50;
            const yVisible = y >= -50 && y < height + 50;

            // For paginated mode, X is the primary check
            const isVisible = rect.width > 0 && rect.height > 0 && xVisible && yVisible;

            if (!isVisible) {
                // Apply debounce
                if (now - this.lastPageTurnTime < 300) {
                    return;
                }

                // 🔴 暂时禁用章节内自动翻页
                // 当前的 isVisible 判断不够准确，导致翻页过早或翻页后与朗读不同步
                // 章节间翻页通过 onend -> autoAdvanceAndContinue 工作正常
                console.log(`[EpubTTS] Content not visible (x=${Math.round(x)} y=${Math.round(y)}) - page turn DISABLED`);

                // 注释掉以下代码以禁用自动翻页
                // this.lastPageTurnTime = now;
                // this.rendition.next();
            }
        } catch (e) {
            console.warn('[EpubTTSController] ensureHighlightVisible failed:', e);
            // 不做任何跳转，让朗读继续
        }
    }

    /**
     * Clear all TTS highlights
     */
    clearHighlights(): void {
        this.cleanupOverlay();
        this.currentHighlightCfi = null;
        this.sentenceHighlightCfi = null;
        this.lastHighlightedSentenceKey = '';
    }

    /**
     * Check if we're near the end of visible content
     * When TTS naturally ends (onend callback), we should auto-advance
     */
    isNearEndOfPage(lastPlayedIndex?: number): boolean {
        if (this.textSegments.length === 0) {
            console.log('[EpubTTSController] isNearEndOfPage: no segments');
            return true; // 🆕 如果没有段落，直接尝试翻页
        }

        const lastSegment = this.textSegments[this.textSegments.length - 1];
        const lastContentIndex = lastSegment.startIndex + lastSegment.text.length;
        const totalLength = this.fullText.length;

        console.log(`[EpubTTSController] isNearEndOfPage: lastContentIndex=${lastContentIndex}, totalLength=${totalLength}`);

        // 🆕 简化逻辑：当 TTS 自然结束时（onend 被调用），我们应该自动翻页
        // 因为 onend 只有在朗读完当前内容后才会触发
        return true;
    }

    /**
     * Get start index of next sentence
     */
    getNextSentenceStart(charIndex: number): number | null {
        const { end } = this.findSentenceBoundaries(charIndex);
        // Ensure we don't jump past end
        if (end >= this.fullText.length - 1) return null;
        return end;
    }

    /**
     * Get start index of previous sentence
     */
    getPrevSentenceStart(charIndex: number): number | null {
        const { start } = this.findSentenceBoundaries(charIndex);
        if (start <= 0) return null;
        // Look back from just before the current start
        const { start: prevStart } = this.findSentenceBoundaries(start - 2);
        return prevStart;
    }

    /**
     * Check if we are at the end of the current chapter (spine item)
     */
    isAtEndOfChapter(): boolean {
        if (!this.rendition) return false;
        try {
            const loc = this.rendition.currentLocation();
            if (loc && (loc.atEnd || loc.end.index < loc.start.index)) { // Safety check
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    /**
     * Force jump to next chapter/spine item
     */
    private isNavigating: boolean = false;

    async forceNextChapter(): Promise<void> {
        if (!this.rendition || this.isNavigating) {
            console.log('[EpubTTSController] Skipping forceNextChapter (no rendition or already navigating)');
            return;
        }

        this.isNavigating = true;
        this.isAutoNavigating = true;
        console.log('[EpubTTSController] Starting auto-navigation (forceNextChapter)');

        try {
            const loc = this.rendition.currentLocation();
            if (loc) {
                const currentIndex = loc.start.index;
                const nextItem = this.rendition.book.spine.get(currentIndex + 1);
                if (nextItem) {
                    console.log('[EpubTTSController] Forcing jump to next spine item:', nextItem.href);
                    await this.rendition.display(nextItem.href);
                    return;
                }
            }
            // Fallback
            await this.rendition.next();
        } catch (e) {
            console.error('[EpubTTSController] forceNextChapter failed:', e);
        }
    }

    /**
     * Navigate to next page (Simple wrapper - just navigation)
     * Returns whether navigation was successful
     */
    async nextPage(): Promise<boolean> {
        if (!this.rendition) {
            console.log('[EpubTTSController] nextPage: no rendition');
            return false;
        }

        try {
            console.log('[EpubTTSController] nextPage: navigating...');

            // If we are at end of chapter, force next chapter
            if (this.isAtEndOfChapter()) {
                await this.forceNextChapter();
            } else {
                await this.rendition.next();
            }

            return true;
        } catch (e) {
            console.error('[EpubTTSController] nextPage failed:', e);
            return false;
        }
    }

    /**
     * Navigate to previous page
     */
    async prevPage(): Promise<boolean> {
        if (!this.rendition) return false;
        try {
            await this.rendition.prev();
            return true;
        } catch (e) {
            console.error('[EpubTTSController] prevPage failed:', e);
            return false;
        }
    }

    /**
     * AUTO-ADVANCE AND CONTINUE (方案A 核心)
     * The CORRECT flow for auto-page-turn:
     * 1. Invalidate current TTS session
     * 2. Navigate to next page
     * 3. Wait for page to be fully rendered
     * 4. Extract text from new page
     * 5. If no text (image-only page), try next page (up to maxRetries)
     * 6. Return segments (caller will start new TTS)
     */
    async autoAdvanceAndContinue(retryCount: number = 0): Promise<{ success: boolean; text: string }> {
        const maxRetries = 10; // Prevent infinite loop, skip at most 10 empty pages

        console.log(`[EpubTTSController] autoAdvanceAndContinue: starting... (retry: ${retryCount})`);

        // Step 1: Invalidate current session
        this.invalidateSession('auto-advance');

        // Step 2: Navigate to next page
        const navigated = await this.nextPage();
        if (!navigated) {
            console.log('[EpubTTSController] autoAdvanceAndContinue: navigation failed (end of book?)');
            return { success: false, text: '' };
        }

        // Step 3: Wait for page to be fully rendered
        console.log('[EpubTTSController] autoAdvanceAndContinue: waiting for page ready...');
        await this.waitForPageReady();

        // Step 4: Extract text from new page (MUST re-extract after iframe changes)
        console.log('[EpubTTSController] autoAdvanceAndContinue: extracting text...');
        const text = await this.extractCurrentPageText();

        // Step 5: If no text and we haven't exceeded retries, try next page
        if (!text || text.trim().length === 0) {
            if (retryCount < maxRetries) {
                console.log(`[EpubTTSController] autoAdvanceAndContinue: no text on page (image-only?), trying next page...`);
                return this.autoAdvanceAndContinue(retryCount + 1);
            } else {
                console.log('[EpubTTSController] autoAdvanceAndContinue: max retries reached, stopping');
                return { success: false, text: '' };
            }
        }

        console.log('[EpubTTSController] autoAdvanceAndContinue: success, text length:', text.length);

        // Step 6: Return text for new TTS session
        return { success: true, text };
    }

    /**
     * Reset auto-navigation flag (call from epub-renderer after handling)
     */
    resetAutoNavigating() {
        this.isAutoNavigating = false;
    }

    /**
     * Get rendition for external use
     */
    getRendition(): any {
        return this.rendition;
    }
}

// Singleton instance
export const epubTTSController = new EpubTTSController();
