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
     * Update word highlight based on current TTS charIndex
     */
    async highlightWord(charIndex: number): Promise<void> {
        if (!this.rendition) {
            console.log('[EpubTTSController] highlightWord: no rendition');
            return;
        }

        const segment = this.findSegmentForCharIndex(charIndex);
        if (!segment) {
            console.log('[EpubTTSController] highlightWord: no segment for charIndex', charIndex);
            return;
        }
        if (!segment.cfi) {
            console.log('[EpubTTSController] highlightWord: segment has no CFI');
            return;
        }

        try {
            // Clear previous word highlight
            if (this.currentHighlightCfi) {
                try {
                    this.rendition.annotations.remove(this.currentHighlightCfi, 'highlight');
                } catch (e) {
                    // Ignore removal errors
                }
            }

            // Use underline annotation type for word highlighting
            // This is more visible than highlight for individual words
            this.rendition.annotations.underline(
                segment.cfi,
                { data: { charIndex } },
                (e: any) => { },
                'epub-word-underline',
                {
                    'border-bottom': '3px solid orange',
                    'background-color': 'rgba(255, 152, 0, 0.3)',
                    'border-radius': '2px',
                }
            );
            this.currentHighlightCfi = segment.cfi;

            console.log('[EpubTTSController] Word highlighted at CFI:', segment.cfi.substring(0, 50));

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
                try {
                    this.rendition.annotations.remove(this.sentenceHighlightCfi, 'highlight');
                } catch (e) {
                    // Ignore removal errors
                }
            }

            // Highlight first segment of sentence with visible yellow background
            const firstSeg = sentenceSegments[0];
            if (firstSeg.cfi) {
                this.rendition.annotations.highlight(
                    firstSeg.cfi,
                    { data: { charIndex } },
                    () => { },
                    'epub-sentence-highlight',
                    {
                        'background-color': 'rgba(255, 235, 59, 0.4)',
                        'border-radius': '3px',
                    }
                );
                this.sentenceHighlightCfi = firstSeg.cfi;
                console.log('[EpubTTSController] Sentence highlighted');
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
