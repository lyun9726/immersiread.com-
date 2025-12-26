/**
 * EPUB Processor - Core utility for creating bilingual EPUB files
 * 
 * This module handles:
 * 1. Parsing EPUB files (ZIP format)
 * 2. Extracting text from HTML content
 * 3. Injecting translations into HTML
 * 4. Repackaging as a new EPUB file
 */

import JSZip from 'jszip'
import { parse as parseHTML, HTMLElement, TextNode } from 'node-html-parser'
import { translateBatch } from '@/lib/translate/translateBatch'

// CSS styles for bilingual display modes
const BILINGUAL_CSS = `
/* Bilingual Book Maker Styles */

/* Original text styling */
.bbm-original {
  display: block;
}

/* Translated text styling */
.bbm-translated {
  display: block;
  background-color: rgba(59, 130, 246, 0.08);
  border-left: 3px solid rgba(59, 130, 246, 0.5);
  padding-left: 0.75em;
  margin-top: 0.25em;
  margin-bottom: 0.5em;
  color: inherit;
}

/* Mode: Original Only */
body.mode-original .bbm-translated {
  display: none !important;
}

/* Mode: Translation Only */
body.mode-translation .bbm-original {
  display: none !important;
}

/* Mode: Bilingual (default - show both) */
body.mode-bilingual .bbm-original,
body.mode-bilingual .bbm-translated {
  display: block;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .bbm-translated {
    background-color: rgba(59, 130, 246, 0.15);
  }
}
`

// JavaScript for mode switching (injected into EPUB)
const MODE_SWITCH_JS = `
(function() {
  // Get mode from localStorage or default to bilingual
  var mode = localStorage.getItem('bbm-reading-mode') || 'bilingual';
  document.body.className = document.body.className.replace(/mode-\\w+/g, '');
  document.body.classList.add('mode-' + mode);
  
  // Listen for mode change messages from parent window
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'bbm-mode-change') {
      var newMode = event.data.mode;
      document.body.className = document.body.className.replace(/mode-\\w+/g, '');
      document.body.classList.add('mode-' + newMode);
      localStorage.setItem('bbm-reading-mode', newMode);
    }
  });
})();
`

export interface TranslationItem {
    id: string
    original: string
    translation: string
}

export interface ProcessingProgress {
    stage: 'parsing' | 'translating' | 'injecting' | 'packaging'
    current: number
    total: number
    message: string
}

export type ProgressCallback = (progress: ProcessingProgress) => void

/**
 * Main class for processing EPUB files into bilingual format
 */
export class EpubProcessor {
    private zip: JSZip
    private contentFiles: Map<string, string> = new Map()
    private translationCache: Map<string, string> = new Map()

    constructor() {
        this.zip = new JSZip()
    }

    /**
     * Process an EPUB file and create a bilingual version
     * @param epubBuffer - The original EPUB file as ArrayBuffer
     * @param onProgress - Optional callback for progress updates
     * @returns The bilingual EPUB as ArrayBuffer
     */
    async createBilingualEpub(
        epubBuffer: ArrayBuffer,
        onProgress?: ProgressCallback
    ): Promise<ArrayBuffer> {
        const report = (stage: ProcessingProgress['stage'], current: number, total: number, message: string) => {
            if (onProgress) {
                onProgress({ stage, current, total, message })
            }
        }

        // Step 1: Parse EPUB
        report('parsing', 0, 100, '正在解析 EPUB 文件...')
        await this.loadEpub(epubBuffer)

        // Step 2: Extract and collect all text for translation
        report('parsing', 50, 100, '正在提取文本内容...')
        const textItems = await this.extractAllText()

        if (textItems.length === 0) {
            throw new Error('No translatable text found in EPUB')
        }

        report('translating', 0, textItems.length, `正在翻译 ${textItems.length} 个段落...`)

        // Step 3: Translate in batches
        const translatedItems = await this.translateTexts(textItems, (current, total) => {
            report('translating', current, total, `正在翻译 ${current}/${total} 个段落...`)
        })

        // Build translation cache
        for (const item of translatedItems) {
            this.translationCache.set(item.id, item.translation)
        }

        // Step 4: Inject translations into HTML files
        report('injecting', 0, this.contentFiles.size, '正在注入翻译内容...')
        await this.injectTranslations((current, total) => {
            report('injecting', current, total, `正在处理 ${current}/${total} 个章节...`)
        })

        // Step 5: Package new EPUB
        report('packaging', 0, 100, '正在生成双语电子书...')
        const result = await this.packageEpub()
        report('packaging', 100, 100, '完成!')

        return result
    }

    /**
     * Load and parse EPUB file
     */
    private async loadEpub(buffer: ArrayBuffer): Promise<void> {
        this.zip = await JSZip.loadAsync(buffer)

        // Find all HTML/XHTML content files
        const contentTypes = ['.html', '.xhtml', '.htm']

        for (const [path, file] of Object.entries(this.zip.files)) {
            if (file.dir) continue

            const ext = path.toLowerCase().substring(path.lastIndexOf('.'))
            if (contentTypes.includes(ext)) {
                const content = await file.async('text')
                this.contentFiles.set(path, content)
            }
        }

        console.log(`[EpubProcessor] Found ${this.contentFiles.size} content files`)
    }

    /**
     * Extract all translatable text from content files
     */
    private async extractAllText(): Promise<{ id: string; text: string }[]> {
        const allItems: { id: string; text: string }[] = []
        let globalIndex = 0

        for (const [filePath, content] of this.contentFiles) {
            const root = parseHTML(content, {
                lowerCaseTagName: false,
                comment: false,
                voidTag: {
                    tags: ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']
                }
            })

            // Find all paragraph-like elements
            const translatableTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'figcaption']

            for (const tagName of translatableTags) {
                const elements = root.querySelectorAll(tagName)

                for (const el of elements) {
                    const text = el.text?.trim()

                    // Skip empty, very short, or already processed elements
                    if (!text || text.length < 5) continue

                    // Skip elements that look like they're just numbers, links, etc
                    if (this.isNonTranslatable(text)) continue

                    // Create unique ID for this text
                    const id = `${filePath}:${globalIndex}`
                    globalIndex++

                    allItems.push({ id, text })
                }
            }
        }

        console.log(`[EpubProcessor] Extracted ${allItems.length} text items for translation`)
        return allItems
    }

    /**
     * Check if text should not be translated
     */
    private isNonTranslatable(text: string): boolean {
        // Pure numbers
        if (/^\d+$/.test(text)) return true

        // Too short
        if (text.length < 10) return true

        // Just punctuation
        if (/^[\s\p{P}]+$/u.test(text)) return true

        // URLs
        if (/^https?:\/\//.test(text)) return true

        // ISBN
        if (/^e?isbn/i.test(text)) return true

        // Page numbers like "Page 1" or "第1页"
        if (/^(page|页|頁)\s*\d+$/i.test(text)) return true

        return false
    }

    /**
     * Translate all extracted texts
     */
    private async translateTexts(
        items: { id: string; text: string }[],
        onProgress?: (current: number, total: number) => void
    ): Promise<TranslationItem[]> {
        const inputItems = items.map(item => ({
            id: item.id,
            text: item.text,
            lang: 'en' // Source language
        }))

        let completed = 0
        const batchSize = 20
        const results: TranslationItem[] = []

        // Process in batches to track progress
        for (let i = 0; i < inputItems.length; i += batchSize) {
            const batch = inputItems.slice(i, i + batchSize)

            const batchResults = await translateBatch(batch, {
                batchSize,
                concurrency: 2,
                retries: 3
            })

            for (const result of batchResults) {
                results.push({
                    id: result.id,
                    original: items.find(it => it.id === result.id)?.text || '',
                    translation: result.translation
                })
            }

            completed += batch.length
            if (onProgress) {
                onProgress(completed, inputItems.length)
            }
        }

        return results
    }

    /**
     * Inject translations into all content files
     */
    private async injectTranslations(
        onProgress?: (current: number, total: number) => void
    ): Promise<void> {
        let processed = 0
        const total = this.contentFiles.size

        for (const [filePath, content] of this.contentFiles) {
            const modifiedContent = this.injectTranslationsIntoHtml(content, filePath)
            this.contentFiles.set(filePath, modifiedContent)

            processed++
            if (onProgress) {
                onProgress(processed, total)
            }
        }
    }

    /**
     * Inject translations into a single HTML file
     */
    private injectTranslationsIntoHtml(html: string, filePath: string): string {
        const root = parseHTML(html, {
            lowerCaseTagName: false,
            comment: true,
            voidTag: {
                tags: ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']
            }
        })

        // Inject CSS into <head>
        const head = root.querySelector('head')
        if (head) {
            // Add bilingual CSS
            const styleTag = parseHTML(`<style type="text/css" id="bbm-styles">${BILINGUAL_CSS}</style>`)
            head.appendChild(styleTag)

            // Add mode switch script
            const scriptTag = parseHTML(`<script type="text/javascript" id="bbm-script">${MODE_SWITCH_JS}</script>`)
            head.appendChild(scriptTag)
        }

        // Set default mode on body
        const body = root.querySelector('body')
        if (body) {
            const existingClass = body.getAttribute('class') || ''
            body.setAttribute('class', `${existingClass} mode-bilingual`.trim())
        }

        // Find and process translatable elements
        const translatableTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'figcaption']
        let elementIndex = 0

        for (const tagName of translatableTags) {
            const elements = root.querySelectorAll(tagName)

            for (const el of elements) {
                const text = el.text?.trim()
                if (!text || text.length < 5 || this.isNonTranslatable(text)) continue

                // Find translation for this text
                const id = `${filePath}:${elementIndex}`
                const translation = this.translationCache.get(id)
                elementIndex++

                if (!translation) continue

                // Add class to original element
                const existingClass = el.getAttribute('class') || ''
                el.setAttribute('class', `${existingClass} bbm-original`.trim())

                // Create translated element
                const tagNameLower = el.tagName.toLowerCase()
                const translatedEl = parseHTML(`<${tagNameLower} class="bbm-translated">${this.escapeHtml(translation)}</${tagNameLower}>`)

                // Insert after original
                // Note: node-html-parser doesn't have insertAfter, so we need to work around
                const parent = el.parentNode
                if (parent) {
                    const siblings = parent.childNodes
                    const index = siblings.indexOf(el)
                    if (index !== -1) {
                        // Insert the translated element after the original
                        siblings.splice(index + 1, 0, translatedEl)
                    }
                }
            }
        }

        return root.toString()
    }

    /**
     * Escape HTML entities
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
    }

    /**
     * Package the modified content back into an EPUB
     */
    private async packageEpub(): Promise<ArrayBuffer> {
        // Update content files in zip
        for (const [path, content] of this.contentFiles) {
            this.zip.file(path, content)
        }

        // Generate the new EPUB
        const epubBuffer = await this.zip.generateAsync({
            type: 'arraybuffer',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        })

        return epubBuffer
    }
}

/**
 * Convenience function to create a bilingual EPUB
 */
export async function createBilingualEpub(
    epubBuffer: ArrayBuffer,
    onProgress?: ProgressCallback
): Promise<ArrayBuffer> {
    const processor = new EpubProcessor()
    return processor.createBilingualEpub(epubBuffer, onProgress)
}
