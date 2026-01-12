/**
 * injectSpeakableMarkers.ts
 * 
 * 给 EPUB iframe 内的 DOM 注入 data-block-id 和 data-sentence-id 标记
 * 这样 SpeakTargetResolver 才能正确解析点击位置
 * 
 * 注入后的结构：
 * <p data-block-id="b-0">
 *   <span data-sentence-id="s-0-0">First sentence.</span>
 *   <span data-sentence-id="s-0-1">Second sentence.</span>
 * </p>
 */

// 句子分割的正则表达式
const SENTENCE_DELIMITERS = /([。！？.!?]+)/g
const CJK_SENTENCE_END = /[。！？]/
const WESTERN_SENTENCE_END = /[.!?]/

/**
 * 给 EPUB 文档注入可朗读标记
 */
export function injectSpeakableMarkers(doc: Document): void {
    if (!doc || !doc.body) return

    // 检查是否已经注入过
    if (doc.body.getAttribute('data-speakable-injected') === 'true') {
        return
    }

    console.log('[injectSpeakableMarkers] Starting injection...')

    let blockIndex = 0

    // 选择所有潜在的朗读块
    const blockSelectors = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, caption, div.text'
    const blocks = doc.querySelectorAll<HTMLElement>(blockSelectors)

    blocks.forEach(block => {
        // 跳过空块或已注入的块
        if (!block.textContent?.trim()) return
        if (block.hasAttribute('data-block-id')) return

        // 跳过翻译元素（bbm-translated 由翻译系统管理）
        if (block.classList.contains('bbm-translated')) return

        // 跳过嵌套块（只处理最外层）
        const parentBlock = block.parentElement?.closest(blockSelectors)
        if (parentBlock && parentBlock !== block) return

        const blockId = `b-${blockIndex++}`
        block.setAttribute('data-block-id', blockId)

        // 尝试分割成句子
        injectSentenceMarkers(block, blockId)
    })

    // 标记为已注入
    doc.body.setAttribute('data-speakable-injected', 'true')

    console.log(`[injectSpeakableMarkers] Injected ${blockIndex} blocks`)
}

/**
 * 在块内注入句子标记
 */
function injectSentenceMarkers(block: HTMLElement, blockId: string): void {
    // 如果块内已经有子元素，可能结构复杂，跳过句子分割
    // 只对纯文本块进行句子分割
    const hasOnlyText = Array.from(block.childNodes).every(
        node => node.nodeType === Node.TEXT_NODE ||
            (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR')
    )

    if (!hasOnlyText) {
        // 复杂块：给整个块一个 sentence ID
        if (!block.hasAttribute('data-sentence-id')) {
            block.setAttribute('data-sentence-id', `${blockId}-0`)
        }
        return
    }

    const text = block.textContent || ''
    const sentences = splitIntoSentences(text)

    if (sentences.length <= 1) {
        // 只有一句话，直接给块加 sentence ID
        block.setAttribute('data-sentence-id', `${blockId}-0`)
        return
    }

    // 多句话：用 span 包裹每句话
    const fragment = document.createDocumentFragment()
    sentences.forEach((sentence, idx) => {
        if (!sentence.trim()) return

        const span = block.ownerDocument.createElement('span')
        span.setAttribute('data-sentence-id', `${blockId}-${idx}`)
        span.textContent = sentence
        fragment.appendChild(span)
    })

    // 替换原内容
    block.innerHTML = ''
    block.appendChild(fragment)
}

/**
 * 将文本分割成句子
 */
function splitIntoSentences(text: string): string[] {
    if (!text) return []

    // 使用标点符号分割，但保留标点
    const parts = text.split(SENTENCE_DELIMITERS)
    const sentences: string[] = []

    let current = ''
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (!part) continue

        // 如果这部分是标点，附加到当前句子
        if (SENTENCE_DELIMITERS.test(part)) {
            current += part
            sentences.push(current.trim())
            current = ''
        } else {
            current += part
        }
    }

    // 处理最后一部分
    if (current.trim()) {
        sentences.push(current.trim())
    }

    return sentences.filter(s => s.length > 0)
}

/**
 * 清除已注入的标记（用于页面变化时重新注入）
 */
export function clearSpeakableMarkers(doc: Document): void {
    if (!doc || !doc.body) return

    doc.body.removeAttribute('data-speakable-injected')

    doc.querySelectorAll('[data-block-id]').forEach(el => {
        el.removeAttribute('data-block-id')
    })

    doc.querySelectorAll('[data-sentence-id]').forEach(el => {
        el.removeAttribute('data-sentence-id')
    })
}
