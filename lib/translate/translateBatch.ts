/**
 * translateBatch.ts
 *
 * Batch translation module with strict one-to-one paragraph alignment
 * - Uses pluggable LLM client (Claude API)
 * - Supports batching, concurrency, retry, and caching
 * - Ensures no reordering, merging, or splitting of blocks
 */

type InputItem = { id: string; text: string; lang?: string }
type OutputItem = { id: string; original: string; translation: string }

interface TranslateBatchOptions {
  batchSize?: number
  concurrency?: number
  retries?: number
  prompt?: string
  useCache?: boolean
  apiKey?: string
  model?: string
}

const DEFAULT_BATCH_SIZE = 32
const DEFAULT_CONCURRENCY = 3
const DEFAULT_RETRIES = 3
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022"

// Simple in-memory cache (production: use Redis)
const cache = new Map<string, string>()

/**
 * Simple hash function for caching
 */
function hashText(s: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  }
  return h.toString(16)
}

/**
 * Call Claude API for translation
 */
async function callClaude(
  items: InputItem[],
  prompt: string,
  apiKey: string,
  model: string
): Promise<OutputItem[]> {
  const inputJson = JSON.stringify(items.map(item => ({
    id: item.id,
    text: item.text,
    lang: item.lang || "en"
  })))

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nInput:\n${inputJson}`
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Claude API error: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const content = data.content[0].text

    // Parse JSON from Claude's response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error("Claude response does not contain valid JSON array")
    }

    const results = JSON.parse(jsonMatch[0])

    // Validate response structure
    if (!Array.isArray(results)) {
      throw new Error("Claude response is not an array")
    }

    return results as OutputItem[]
  } catch (error) {
    console.error("[translateBatch] Claude API error:", error)
    throw error
  }
}

/**
 * Delay function for retry backoff
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Main translateBatch function
 * Translates an array of text items with strict order preservation
 */
export async function translateBatch(
  items: InputItem[],
  options: TranslateBatchOptions = {}
): Promise<OutputItem[]> {
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    concurrency = DEFAULT_CONCURRENCY,
    retries = DEFAULT_RETRIES,
    useCache = true,
    apiKey = process.env.ANTHROPIC_API_KEY || "",
    model = DEFAULT_MODEL
  } = options

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for translation")
  }

  // Load prompt
  const prompt = options.prompt || getDefaultPrompt()

  // Initialize results array with proper length
  const results: OutputItem[] = new Array(items.length)

  // Process items in batches with concurrency control
  const batches: Array<{items: InputItem[], indices: number[]}> = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batchItems = items.slice(i, i + batchSize)
    const batchIndices = Array.from({ length: batchItems.length }, (_, k) => i + k)
    batches.push({ items: batchItems, indices: batchIndices })
  }

  // Process batches with concurrency limit
  const processBatch = async (batch: {items: InputItem[], indices: number[]}) => {
    const { items: batchItems, indices: batchIndices } = batch

    // Check cache first
    const toTranslate: InputItem[] = []
    const toTranslateIdx: number[] = []

    for (let j = 0; j < batchItems.length; j++) {
      const item = batchItems[j]
      const cacheKey = hashText(item.text)

      if (useCache && cache.has(cacheKey)) {
        const cached = cache.get(cacheKey)!
        results[batchIndices[j]] = {
          id: item.id,
          original: item.text,
          translation: cached
        }
      } else {
        toTranslate.push(item)
        toTranslateIdx.push(batchIndices[j])
      }
    }

    if (toTranslate.length === 0) return

    // Attempt translation with retry
    let attempt = 0
    let success = false
    let translatedResults: OutputItem[] = []

    while (attempt < retries && !success) {
      try {
        translatedResults = await callClaude(toTranslate, prompt, apiKey, model)
        success = true
      } catch (error) {
        attempt++
        console.error(`[translateBatch] Attempt ${attempt}/${retries} failed:`, error)

        if (attempt < retries) {
          const backoffMs = 200 * Math.pow(2, attempt)
          await delay(backoffMs)
        } else {
          // Mark all items in batch as failed
          for (let k = 0; k < toTranslate.length; k++) {
            const idx = toTranslateIdx[k]
            const item = toTranslate[k]
            results[idx] = {
              id: item.id,
              original: item.text,
              translation: "" // Empty translation indicates failure
            }
          }
          return
        }
      }
    }

    // Map results back to original indices
    for (let k = 0; k < toTranslate.length; k++) {
      const item = toTranslate[k]
      const mapped = translatedResults.find(r => r.id === item.id)
      const idx = toTranslateIdx[k]
      const translation = mapped?.translation || ""

      results[idx] = {
        id: item.id,
        original: item.text,
        translation
      }

      // Update cache
      if (useCache && translation) {
        const cacheKey = hashText(item.text)
        cache.set(cacheKey, translation)
      }
    }
  }

  // Execute batches with concurrency control
  const executing: Promise<void>[] = []

  for (const batch of batches) {
    const promise = processBatch(batch)
    executing.push(promise)

    if (executing.length >= concurrency) {
      await Promise.race(executing)
      executing.splice(executing.findIndex(p => p === promise), 1)
    }
  }

  await Promise.all(executing)

  // Ensure all results are filled (fallback for any undefined)
  return results.map((r, idx) =>
    r ?? {
      id: items[idx].id,
      original: items[idx].text,
      translation: ""
    }
  )
}

/**
 * Default translation prompt
 */
function getDefaultPrompt(): string {
  return `你现在是 AI 阅读器的**翻译引擎**。
输入是 JSON 数组，格式如下：
[{"id":"<id>","text":"<原文段落>","lang":"<opt>"} , ... ]

**强制规则（必须逐条严格执行，任何违例视为未完成）**
1. 你只能输出一个严格的 JSON 数组，**绝对不能有任何额外说明、解释或文本**。
2. 输出数组的每一项必须与输入一一对应（相同的 id，顺序不变）。
3. 每一项格式必须精确如下：
   { "id": "<same id>", "original": "<原文不变>", "translation": "<对应中文翻译>" }
4. **禁止**把所有原文输出在一起或把所有译文输出在一起；禁止合并多条输入为一条输出；禁止拆分输入 id（除非输入 id 已包含子 id）。
5. 遇到代码段、表格、特殊标记（例如 \`<code>...</code>\`），请在 translation 中保持原样或在行内保留原文。
6. 若遇到你无法翻译的文本（例如模型错误），请返回 translation 为空字符串 ""，但仍要返回对应 id。
7. 翻译口吻：忠实但自然；保留专有名词（例如 Bitcoin -> 比特币）；术语表可以保留英文（可选）。
8. 输出必须为有效 JSON（UTF-8 编码），例如：
   [
     {"id":"p1","original":"This is x.","translation":"这是 x。"},
     {"id":"p2","original":"Another.","translation":"另一个。"}
   ]
9. 若输入段落非常长（> 400 字），你可以在不改变 id 的情况下进行合理句子拆分并分别翻译，然后在 translation 字段里以空格或换行合并回原段落顺序（不要变更 id）。
10. 不要尝试进行润色或改写表达以牺牲原意。

示例输入：
[{"id":"p1","text":"This is the first sentence."}]
示例输出：
[{"id":"p1","original":"This is the first sentence.","translation":"这是第一句。"}]`
}

/**
 * Clear translation cache
 */
export function clearTranslationCache(): void {
  cache.clear()
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys())
  }
}
