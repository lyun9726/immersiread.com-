# Translation System - Reader Library

Complete guide to the translation system for the Reader library functionality.

## Overview

The translation system provides:
- **Batch Translation**: Translate multiple text blocks with strict order preservation
- **Claude API Integration**: Uses Claude API for high-quality translations
- **Caching**: In-memory cache to avoid redundant translations
- **Retry Logic**: Automatic retry with exponential backoff
- **Demo Mode**: Falls back to demo translation when API key is not configured

## Architecture

```
Frontend (Reader Page)
  └── Zustand Store (readerStore)
      └── translateBlocks() action
          └── API: /api/translate/batch
              ├── Demo Mode (no API key)
              └── Real Translation
                  └── lib/translate/translateBatch.ts
                      └── Claude API
```

## Configuration

### 1. Claude API Key (Optional)

To enable real translation, set your Claude API key:

```bash
# .env.local
ANTHROPIC_API_KEY=your_claude_api_key_here
```

**Without API key**: System falls back to demo mode (appends language suffix to text)

**With API key**: System uses Claude API for real translation

### 2. Translation Options

Default configuration (adjustable in code):

```typescript
{
  batchSize: 32,        // Number of items per batch
  concurrency: 3,       // Number of concurrent API requests
  retries: 3,           // Number of retry attempts on failure
  useCache: true,       // Enable in-memory caching
  model: "claude-3-5-sonnet-20241022"  // Claude model to use
}
```

## How It Works

### 1. Translation Request Flow

```
User clicks "Translate All"
  → Frontend calls translateBlocks(items, targetLang)
    → Zustand store action makes API request
      → /api/translate/batch
        → Checks for ANTHROPIC_API_KEY
          ├── If configured: translateBatch() with Claude API
          └── If not: Demo translation (append suffix)
```

### 2. Strict Order Preservation

The translation system **guarantees**:
- One-to-one mapping of input → output
- Same order as input
- No merging or splitting of blocks
- Same IDs preserved

Input:
```json
[
  {"id":"p1", "text":"Hello world"},
  {"id":"p2", "text":"How are you?"}
]
```

Output:
```json
[
  {"id":"p1", "original":"Hello world", "translation":"你好世界"},
  {"id":"p2", "original":"How are you?", "translation":"你好吗？"}
]
```

### 3. Caching Strategy

Translations are cached using a hash of the text:

```typescript
cacheKey = hash(text) → translation
```

- Cache is in-memory (session-based)
- Cache survives within the same session
- Significantly reduces API calls for repeated content

### 4. Error Handling

**Retry Logic**:
- Failed requests are retried up to 3 times
- Exponential backoff: 200ms, 400ms, 800ms
- After max retries, returns empty translation for failed items

**Fallback**:
- If Claude API fails, system falls back to demo mode
- Failed translations show empty string (not error to user)

## Usage

### In Library Reader Page

**1. Navigate to a book:**
```
/reader/[bookId]  or  /reader/demo
```

**2. Click "Translate All" button**
- Translates all blocks to Chinese (zh)
- Shows loading spinner during translation
- Results cached for session

**3. Click "Show Translation" / "Hide Translation"**
- Toggle display of translations
- Translations remain in memory

**4. Play button on each block**
- Plays TTS for that specific block
- Auto-advances to next block when finished

### Programmatic Usage

```typescript
import { useReaderStore } from "@/app/reader/stores/readerStore"

// In your component
const translateBlocks = useReaderStore((state) => state.translateBlocks)

// Translate blocks
await translateBlocks(
  [
    { id: "1", text: "Hello world" },
    { id: "2", text: "How are you?" }
  ],
  "zh" // target language
)

// Access translations
const translatedMap = useReaderStore((state) => state.translation.translatedMap)
console.log(translatedMap["1"]) // "你好世界" (or demo: "Hello world (ZH DEMO)")
```

## API Reference

### POST /api/translate/batch

**Request:**
```json
{
  "items": [
    {"id": "string", "text": "string"}
  ],
  "targetLang": "zh"
}
```

**Response:**
```json
{
  "results": [
    {"id": "string", "translated": "string"}
  ]
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid request (missing items)
- `500`: Server error

### translateBatch Function

```typescript
import { translateBatch } from "@/lib/translate/translateBatch"

const results = await translateBatch(
  items: Array<{id: string, text: string, lang?: string}>,
  options?: {
    batchSize?: number        // Default: 32
    concurrency?: number      // Default: 3
    retries?: number          // Default: 3
    prompt?: string           // Custom prompt (optional)
    useCache?: boolean        // Default: true
    apiKey?: string           // Override API key
    model?: string            // Claude model ID
  }
)

// Returns: Array<{id: string, original: string, translation: string}>
```

## Translation Prompt

The system uses a carefully crafted prompt (`lib/translate/prompt_claude.txt`) that enforces:

1. **Strict JSON output only** - No explanations
2. **One-to-one mapping** - Same IDs, same order
3. **Format preservation** - Code blocks, tables remain intact
4. **Natural translation** - Faithful but natural Chinese
5. **Terminology handling** - Preserves technical terms (Bitcoin → 比特币)

## Performance Considerations

### Batch Size

| Batch Size | API Calls | Speed | Cost |
|------------|-----------|-------|------|
| 16 | More | Faster | Higher |
| 32 (default) | Medium | Balanced | Balanced |
| 64 | Fewer | Slower | Lower |

### Concurrency

| Concurrency | Throughput | API Load |
|-------------|------------|----------|
| 1 | Slowest | Low |
| 3 (default) | Balanced | Medium |
| 5 | Fastest | High |

⚠️ **Note**: Higher concurrency may hit Claude API rate limits

### Caching

With cache enabled:
- First translation: ~3-5 seconds for 10 blocks
- Subsequent (cached): <100ms for same blocks

## Testing

### Demo Mode (No API Key)

1. Ensure `ANTHROPIC_API_KEY` is NOT set
2. Navigate to `/reader/demo`
3. Click "Translate All"
4. Should see: `"Text (ZH DEMO)"` appended to each block

### Real Translation (With API Key)

1. Set `ANTHROPIC_API_KEY` in `.env.local`
2. Restart dev server
3. Navigate to `/reader/demo`
4. Click "Translate All"
5. Should see real Chinese translations

### Check Server Logs

```bash
# Look for these log messages:
[Translate Batch] Using Claude API for translation
[Translate Batch] Using demo translation mode
```

## Troubleshooting

### Translation Not Working

**Problem**: Clicking "Translate All" does nothing

**Solutions**:
1. Check browser console for errors
2. Check server logs for API errors
3. Verify blocks are loaded (check Zustand store)

### Empty Translations

**Problem**: Translations show empty

**Solutions**:
1. Check Claude API key is valid
2. Check API rate limits not exceeded
3. Check server logs for retry failures

### Wrong Order

**Problem**: Translations appear in wrong order

**This should never happen!** The system strictly preserves order. If this occurs:
1. Check Claude API response format
2. Verify prompt hasn't been modified
3. File a bug report

## Advanced Configuration

### Custom Translation Prompt

```typescript
import { translateBatch } from "@/lib/translate/translateBatch"

const customPrompt = `Your custom prompt here...`

const results = await translateBatch(items, {
  prompt: customPrompt
})
```

### Using Different Claude Model

```typescript
const results = await translateBatch(items, {
  model: "claude-3-opus-20240229" // Opus model (higher quality, slower)
})
```

### Clearing Cache

```typescript
import { clearTranslationCache } from "@/lib/translate/translateBatch"

clearTranslationCache()
```

## Production Deployment

### Required Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Recommended Configuration

```typescript
{
  batchSize: 32,
  concurrency: 3,
  retries: 3,
  useCache: true
}
```

### Cost Estimation

**Claude 3.5 Sonnet Pricing** (as of 2024):
- Input: ~$0.003 per 1K tokens
- Output: ~$0.015 per 1K tokens

**Example**:
- 100 blocks × 50 words each = 5000 words ≈ 6500 tokens
- Input cost: 6.5K × $0.003 = $0.02
- Output cost: 6.5K × $0.015 = $0.10
- **Total**: ~$0.12 per 100 blocks

With caching, repeated translations are free!

### Replace In-Memory Cache

For production, replace in-memory cache with Redis:

```typescript
// lib/translate/translateBatch.ts
// Replace:
const cache = new Map<string, string>()

// With:
import Redis from "ioredis"
const redis = new Redis(process.env.REDIS_URL)

// In translateBatch function:
const cached = await redis.get(cacheKey)
await redis.set(cacheKey, translation, "EX", 86400) // 24h TTL
```

## API Limits

**Claude API Rate Limits** (varies by plan):
- Free tier: ~5 requests/min
- Paid tier: ~100 requests/min

With `concurrency: 3` and `batchSize: 32`:
- Processing 1000 blocks takes ~3-5 minutes
- Well within rate limits for most plans

## Future Enhancements

Planned improvements:
1. Support for multiple target languages (not just Chinese)
2. Language detection from source text
3. Streaming translation results
4. Translation quality scoring
5. User feedback loop for corrections
6. Terminology glossary management

## Support

For issues or questions:
1. Check server logs for detailed error messages
2. Review `docs/TESTING_GUIDE.md` for testing procedures
3. Check `docs/TASK2_README.md` for Reader core documentation

## License

MIT
