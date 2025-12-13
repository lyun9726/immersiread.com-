/**
 * EpubTTSController - Manages TTS sync highlighting for EPUB reader
 * 
 * Key responsibilities:
 * - Extract text from current EPUB page/chapter
 * - Map character indices to CFI ranges for precise highlighting
 * - Manage highlight annotations via epub.js rendition API
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

export class EpubTTSController {
    private rendition: any = null;
    private textSegments: TextSegment[] = [];
    private fullText: string = '';
    private currentHighlightCfi: string | null = null;
    private sentenceHighlightCfi: string | null = null;

    /**
     * Initialize controller with epub.js rendition
     */
    setRendition(rendition: any) {
        this.rendition = rendition;

        // Inject TTS highlight styles
        this.injectStyles();

        // Listen for location changes to update text segments
        rendition.on('relocated', () => {
            this.extractCurrentPageText();
        });
    }

    /**
     * Inject CSS styles for TTS highlighting
     */
    private injectStyles() {
        if (!this.rendition) return;

        // Register custom styles for TTS highlighting
        this.rendition.themes.default({
            '.tts-sentence-highlight': {
                'background-color': 'rgba(255, 235, 59, 0.3) !important',
                'border-radius': '2px',
            },
            '.tts-word-highlight': {
                'background-color': 'rgba(255, 152, 0, 0.4) !important',
                'text-decoration': 'underline',
                'text-decoration-color': 'orange',
                'text-underline-offset': '3px',
                'border-radius': '2px',
            }
        });
    }

    /**
     * Extract text from current visible EPUB content
     */
    async extractCurrentPageText(): Promise<string> {
        if (!this.rendition) return '';

        const contents = this.rendition.getContents();
        if (!contents || contents.length === 0) return '';

        const content = contents[0];
        const doc = content.document;
        if (!doc || !doc.body) return '';

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
     * Update word highlight based on current TTS charIndex
     */
    async highlightWord(charIndex: number): Promise<void> {
        if (!this.rendition) return;

        const segment = this.findSegmentForCharIndex(charIndex);
        if (!segment || !segment.cfi) return;

        const contents = this.rendition.getContents()[0];
        if (!contents) return;

        try {
            // Clear previous word highlight
            if (this.currentHighlightCfi) {
                this.rendition.annotations.remove(this.currentHighlightCfi, 'highlight');
            }

            // Find word boundaries within the segment
            const offsetInSegment = charIndex - segment.startIndex;
            const text = segment.text;

            // Find word start (go back to space/punctuation or start)
            let wordStart = offsetInSegment;
            while (wordStart > 0 && !/[\s，。？！,.\-]/.test(text[wordStart - 1])) {
                wordStart--;
            }

            // Find word end (go forward to space/punctuation or end)
            let wordEnd = offsetInSegment;
            while (wordEnd < text.length && !/[\s，。？！,.\-]/.test(text[wordEnd])) {
                wordEnd++;
            }

            // Limit word length for Chinese
            if (wordEnd - wordStart > 6) {
                wordEnd = wordStart + 6;
            }

            // Create a range and highlight it
            // For simplicity, highlight the entire segment for now
            // (More precise word-level highlighting requires range manipulation)
            this.rendition.annotations.highlight(
                segment.cfi,
                {},
                (e: any) => { },
                'tts-word-highlight'
            );
            this.currentHighlightCfi = segment.cfi;

            // Check if we need to scroll
            this.ensureHighlightVisible(segment);

        } catch (error) {
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
            // Clear previous sentence highlight
            if (this.sentenceHighlightCfi) {
                this.rendition.annotations.remove(this.sentenceHighlightCfi, 'highlight');
            }

            // Highlight first segment of sentence (simplified)
            const firstSeg = sentenceSegments[0];
            if (firstSeg.cfi) {
                this.rendition.annotations.highlight(
                    firstSeg.cfi,
                    {},
                    () => { },
                    'tts-sentence-highlight'
                );
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

        const doc = contents.document;
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
        if (!this.rendition) return;

        try {
            if (this.currentHighlightCfi) {
                this.rendition.annotations.remove(this.currentHighlightCfi, 'highlight');
                this.currentHighlightCfi = null;
            }
            if (this.sentenceHighlightCfi) {
                this.rendition.annotations.remove(this.sentenceHighlightCfi, 'highlight');
                this.sentenceHighlightCfi = null;
            }
        } catch (error) {
            console.warn('[EpubTTSController] Error clearing highlights:', error);
        }
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
