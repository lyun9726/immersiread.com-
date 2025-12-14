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
        console.log('[EpubTTSController] First 100 chars:', this.fullText.substring(0, 100));

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
     * Draw highlight manually using absolute positioned divs
     * IMPROVED: Accepts optional segment node to use for range calculation instead of CFI
     */
    private drawHighlight(cfi: string, type: 'word' | 'sentence', segment?: TextSegment): void {
        if (!this.rendition) return;

        try {
            // Get the document to manipulate
            const view = this.rendition.getContents()[0];
            if (!view) return;
            const doc = view.document;
            const body = doc.body;

            // Strategy: Try to use Node directly if available, fallback to CFI
            let range: Range | null = null;

            if (segment && segment.node) {
                try {
                    range = doc.createRange();
                    range.selectNodeContents(segment.node);
                } catch (e) {
                    console.warn('[EpubTTSController] Could not create range from node, falling back to CFI');
                }
            }

            if (!range) {
                try {
                    range = this.rendition.getRange(cfi);
                } catch (e) {
                    console.warn('[EpubTTSController] Could not create range from CFI');
                }
            }

            if (!range) {
                console.warn('[EpubTTSController] Could not get range for CFI:', cfi);
                return;
            }

            // Create or get container layer
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
                container.style.zIndex = '100'; // Make sure it's above text but not crazy high
                container.style.overflow = 'visible';
                body.appendChild(container); // Append to body
            }

            // Clear existing highlights of this type
            const existing = container.querySelectorAll(`.tts-manual-${type}`);
            existing.forEach(el => el.remove());

            // Get rects
            const rects = range.getClientRects();

            // Get scroll offset
            const win = doc.defaultView || doc.parentWindow;
            const scrollX = win.pageXOffset || doc.documentElement.scrollLeft;
            const scrollY = win.pageYOffset || doc.documentElement.scrollTop;

            if (rects.length > 0) {
                this.debugInfo.lastRect = `L:${Math.round(rects[0].left)} T:${Math.round(rects[0].top)} W:${Math.round(rects[0].width)}`;
            } else {
                this.debugInfo.lastRect = 'No rects';
            }

            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i];
                if (rect.width === 0 || rect.height === 0) continue; // Skip empty rects

                const div = doc.createElement('div');
                div.className = `tts-manual-${type}`;

                // Styles
                div.style.position = 'absolute';
                div.style.left = `${rect.left + scrollX}px`;
                div.style.top = `${rect.top + scrollY}px`;
                div.style.width = `${rect.width}px`;
                div.style.height = `${rect.height}px`;
                div.style.pointerEvents = 'none';
                div.setAttribute('data-cfi', cfi);

                // Type specific styles - PRODUCTION STYLES
                if (type === 'word') {
                    // Standard word highlight: Orange underline + light background
                    div.style.borderBottom = '3px solid orange';
                    div.style.backgroundColor = 'rgba(255, 152, 0, 0.3)';
                    div.style.borderRadius = '2px';
                    div.style.zIndex = '10';
                } else {
                    // Standard sentence highlight: Yellow background
                    div.style.backgroundColor = 'rgba(255, 235, 59, 0.4)';
                    div.style.borderRadius = '3px';
                    div.style.mixBlendMode = 'multiply';
                    div.style.zIndex = '5'; // Sentence behind word
                }

                container.appendChild(div);
            }

            // Update debug info with total highlights
            this.debugInfo.annotationCount = container.children.length;

        } catch (e: any) {
            console.error('[EpubTTSController] Draw highlight error:', e);
            this.debugInfo.lastError = 'Draw err: ' + e.message;
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
    async highlightWord(charIndex: number): Promise<void> {
        this.debugInfo.lastCharIndex = charIndex;
        this.debugInfo.highlightAttempted = true;
        this.debugInfo.lastError = '';

        if (!this.rendition) {
            this.debugInfo.lastError = 'No rendition';
            return;
        }

        const segment = this.findSegmentForCharIndex(charIndex);
        if (!segment) {
            this.debugInfo.lastError = 'No segment found';
            this.debugInfo.segmentFound = false;
            return;
        }

        this.debugInfo.segmentFound = true;
        this.debugInfo.segmentText = segment.text;

        if (!segment.cfi) {
            this.debugInfo.lastError = 'Segment has no CFI';
            this.debugInfo.cfi = 'none';
            return;
        }

        this.debugInfo.cfi = segment.cfi;

        try {
            // Use manual draw - pass segment to use node logic
            this.drawHighlight(segment.cfi, 'word', segment);
            this.currentHighlightCfi = segment.cfi;

            // Scroll if needed
            this.ensureHighlightVisible(segment);

        } catch (error: any) {
            this.debugInfo.lastError = 'Highlight error: ' + (error.message || error);
            console.warn('[EpubTTSController] Error highlighting word:', error);
        }
    }

    /**
     * Highlight the current sentence
     */
    async highlightSentence(charIndex: number): Promise<void> {
        if (!this.rendition) return;

        const { start, end } = this.findSentenceBoundaries(charIndex);

        // Find all segments that belong to this sentence
        const sentenceSegments = this.textSegments.filter(seg => {
            const segEnd = seg.startIndex + seg.text.length;
            return segEnd > start && seg.startIndex < end;
        });

        if (sentenceSegments.length === 0) return;

        try {
            // For now, highlight the first segment of the sentence
            const firstSeg = sentenceSegments[0];
            if (firstSeg.cfi) {
                // Use manual draw
                this.drawHighlight(firstSeg.cfi, 'sentence', firstSeg);
                this.sentenceHighlightCfi = firstSeg.cfi;
            }
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
