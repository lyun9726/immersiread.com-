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

    /**
     * Initialize controller with epub.js rendition
     */
    setRendition(rendition: any) {
        this.rendition = rendition;
        this.debugInfo.renditionReady = !!rendition;

        // Listen for location changes to update text segments
        rendition.on('relocated', () => {
            this.extractCurrentPageText();
            this.cleanupOverlay(); // Cleanup on page turn
            this.lastHighlightedSentenceKey = ''; // Reset
        });
    }

    /**
     * Extract text from current visible EPUB content
     */
    async extractCurrentPageText(): Promise<string> {
        console.log('[EpubTTSController] extractCurrentPageText called');
        console.log('[EpubTTSController] rendition:', this.rendition ? 'exists' : 'null');

        if (!this.rendition) {
            console.error('[EpubTTSController] No rendition set!');
            return '';
        }

        // Try different methods to get contents
        let contents: any[] = [];
        try {
            contents = this.rendition.getContents();
            console.log('[EpubTTSController] getContents() returned:', contents?.length || 0, 'items');
        } catch (e) {
            console.error('[EpubTTSController] getContents() failed:', e);
        }

        if (!contents || contents.length === 0) {
            // Try alternate method - views
            try {
                const manager = this.rendition.manager;
                if (manager && manager.views && manager.views._views) {
                    contents = manager.views._views.map((v: any) => v.contents);
                    console.log('[EpubTTSController] Got contents from manager.views:', contents.length);
                }
            } catch (e) {
                console.error('[EpubTTSController] Alternate method failed:', e);
            }
        }

        if (!contents || contents.length === 0) {
            console.error('[EpubTTSController] No contents available');
            return '';
        }

        const content = contents[0];
        console.log('[EpubTTSController] content:', content ? 'exists' : 'null');

        const doc = content?.document;
        console.log('[EpubTTSController] doc:', doc ? 'exists' : 'null');

        if (!doc || !doc.body) {
            console.error('[EpubTTSController] No document or body');
            return '';
        }

        console.log('[EpubTTSController] body innerHTML length:', doc.body.innerHTML?.length || 0);

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
                    // Filter out empty nodes and script/style content
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
                // Try to get CFI for this node
                let cfi: string | undefined;
                try {
                    cfi = content.cfiFromNode(node);
                } catch (e) {
                    // CFI generation may fail for some nodes
                }

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
        console.log('[EpubTTSController] Full text length:', this.fullText.length);

        return this.fullText.trim();
    }

    /**
     * Get the full text of current page for TTS
     */
    getFullText(): string {
        return this.fullText;
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
        const sentenceEndPattern = /[。？！.?!]/;

        // Find start (go back to previous sentence end or start of text)
        let start = charIndex;
        while (start > 0 && !sentenceEndPattern.test(this.fullText[start - 1])) {
            start--;
        }

        // Find end (go forward to next sentence end)
        let end = charIndex;
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
            this.ensureHighlightVisible(segment);
        } catch (error: any) {
            console.warn('[EpubTTSController] Error highlighting word:', error);
        }
    }

    /**
     * Highlight the current sentence
     * Improved: Handles multi-segment sentences
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
        } catch (error) {
            console.warn('[EpubTTSController] Error highlighting sentence:', error);
        }
    }

    /**
     * Ensure the highlighted element is visible, scroll if needed
     */
    private ensureHighlightVisible(segment: TextSegment): void {
        if (!segment.node || !segment.node.parentElement) return;

        const element = segment.node.parentElement;
        const contents = this.rendition.getContents()[0];
        if (!contents) return;

        const win = contents.window;
        if (!win) return;

        const rect = element.getBoundingClientRect();
        const viewHeight = win.innerHeight;

        // If element is below visible area, scroll to it
        if (rect.bottom > viewHeight - 50) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    isNearEndOfPage(): boolean {
        if (this.textSegments.length === 0) return false;
        const lastSegment = this.textSegments[this.textSegments.length - 1];
        const lastCharIndex = lastSegment.startIndex + lastSegment.text.length;
        // Consider "near end" if we're within last 10% of content
        return (this.fullText.length - lastCharIndex) < this.fullText.length * 0.1;
    }

    /**
     * Navigate to next page
     */
    async nextPage(): Promise<void> {
        if (!this.rendition) return;
        await this.rendition.next();
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
