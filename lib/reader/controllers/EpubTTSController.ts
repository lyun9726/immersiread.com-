/**
 * EpubTTSController - Manages TTS sync highlighting for EPUB reader
 * 
 * Key responsibilities:
 * - Extract text from current EPUB page/chapter
 * - Map character indices to CFI ranges for precise highlighting
 * - Manage highlight annotations via direct DOM manipulation (Overlay)
 * - Handle auto-page-turn when reading reaches end of visible content
 */

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

    // Callback for text selection
    public onTextSelected: ((charIndex: number, text: string) => void) | null = null;

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

    // Bind listeners to class instance for removal
    private onRelocatedHandler = async () => {
        console.log('[EpubTTSController] Relocated detected, extracting text...');
        await this.extractCurrentPageText();

        this.cleanupOverlay();
        this.lastHighlightedSentenceKey = ''; // Reset

        // Notify listener (useEpubTTS)
        if (this.onPageReady) {
            console.log('[EpubTTSController] Firing onPageReady');
            this.onPageReady();
        }
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

        // Add listeners
        // Check if listeners already attached? epub.js doesn't provide easy check.
        // We assume setRendition is called when rendition changes or initializes.
        // To be safe, try removing first (if it's the same object)
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
     */
    private handleTextClick(event: any, contents: any) {
        console.log('[EpubTTSController] Click detected:', event.type, event.target.tagName);

        if (!this.onTextSelected) {
            console.log('[EpubTTSController] No onTextSelected callback registerd');
            return;
        }

        // Find which segment was clicked
        const target = event.target;

        // Improve lookup: climb up tree if needed
        // But textSegments usually map to Leaf Text Nodes.
        // event.target is the Element (e.g. SPAN, P).
        // So we look for any segment whose node's parent is the target.

        const segment = this.textSegments.find(s => s.node.parentElement === target || s.node === target);

        if (segment) {
            console.log('[EpubTTSController] Matched segment at index:', segment.startIndex);

            // Generate text to play from the START of the sentence containing this segment
            const { start } = this.findSentenceBoundaries(segment.startIndex);

            // Get the text from that point onwards
            const textToPlay = this.fullText.substring(start);

            this.onTextSelected(start, textToPlay);
        } else {
            console.log('[EpubTTSController] No matching segment found for click target');
        }
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

        console.log('[EpubTTSController] Extracted text segments:', this.textSegments.length);

        return this.fullText.trim();
    }

    /**
     * Find the character index corresponding to a given CFI
     * Used for restoring playback position from saved progress
     */
    findCharIndexFromCfi(cfi: string): number {
        if (!cfi || this.textSegments.length === 0) return -1;

        // Try exact match first
        const segment = this.textSegments.find(s => s.cfi === cfi);
        if (segment) return segment.startIndex;

        // Fallback: This is harder without import Epub.CFI
        // We rely on the fact that if we saved it, it's likely one of ours
        return -1;
    }

    /**
     * Get the CFI for a specific character index
     */
    getCfiForCharIndex(charIndex: number): string | null {
        const segment = this.findSegmentForCharIndex(charIndex);
        return segment ? (segment.cfi || null) : null;
    }


    /**
     * Find the text segment containing the given character index
     */
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
                    // Fallback
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
                    console.warn(e);
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
     * Ensure the highlighted element is visible using Rect bounds with SAFETY MARGINS
     * Updated: Checks BOTTOM edge to prevent "peeking" (half-cut-off text)
     */
    private ensureHighlightVisible(segment: TextSegment): void {
        if (!this.rendition || !segment.cfi) return;

        try {
            let isVisible = false;
            let debugMsg = '';

            const range = this.rendition.getRange(segment.cfi);
            if (range) {
                const rect = range.getBoundingClientRect();

                if (rect.width === 0 && rect.height === 0) {
                    isVisible = false;
                    debugMsg = 'ZeroRect';
                } else {
                    const view = this.rendition.getContents()[0];
                    const win = view?.window;

                    if (win) {
                        const width = win.innerWidth;
                        const height = win.innerHeight;

                        const x = rect.left;
                        const y = rect.top;
                        const bottom = rect.bottom;

                        this.debugInfo.lastRect = `y:${Math.round(y)} b:${Math.round(bottom)} h:${height}`;

                        // Safety Margin
                        const margin = 50;

                        // 1. Horizontal Check (Strict)
                        const horizVisible = x >= margin && x < (width - margin);

                        // 2. Vertical Check (Smart)
                        // A. Top must be visible
                        const topVisible = y >= margin && y < (height - margin);

                        // B. Bottom must ALSO be visible (unless the block is taller than the screen)
                        // This prevents "peeking" where only the top line is shown
                        const fitsOnScreen = rect.height < (height - margin * 2);
                        const bottomVisible = !fitsOnScreen || (bottom <= (height - margin));

                        const vertVisible = topVisible && bottomVisible;

                        isVisible = horizVisible && vertVisible;
                        debugMsg = isVisible ? 'Vis' : `Hidden(T:${topVisible} B:${bottomVisible})`;
                    }
                }
            }

            if (!isVisible) {
                // console.log(`[EpubTTS] Segment not visible (${debugMsg}), turning...`, this.debugInfo.lastRect);
                this.rendition.display(segment.cfi);
            }
        } catch (e) {
            console.warn('[EpubTTSController] ensureHighlightVisible failed:', e);
            this.rendition.display(segment.cfi);
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
     */
    isNearEndOfPage(lastPlayedIndex?: number): boolean {
        if (this.textSegments.length === 0) return false;

        const lastSegment = this.textSegments[this.textSegments.length - 1];
        const lastContentIndex = lastSegment.startIndex + lastSegment.text.length;
        const totalLength = this.fullText.length;
        const diff = totalLength - lastContentIndex;

        // If we are provided with the last played char index (from TTS), use that too
        if (lastPlayedIndex !== undefined) {
            if (totalLength - lastPlayedIndex < 100) return true;
        }

        // Consider "near end" if we're within last 20% OR within last 200 characters
        return diff < 200 || diff < totalLength * 0.2;
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
    async forceNextChapter(): Promise<void> {
        if (!this.rendition) return;
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
            await this.rendition.next();
        }
    }

    /**
     * Navigate to next page (Smart wrapper)
     */
    async nextPage(): Promise<void> {
        if (!this.rendition) return;
        // If we are at end of chapter, force next chapter to avoid loops
        if (this.isAtEndOfChapter()) {
            await this.forceNextChapter();
        } else {
            await this.rendition.next();
        }
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
