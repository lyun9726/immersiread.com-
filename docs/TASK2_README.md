# Task 2: Reader Core Logic Implementation

This document describes the Reader core functionality including URL ingestion, parsing, translation, and TTS capabilities.

## Overview

The implementation includes:

- **URL Ingestion** - Fetch and preview web articles
- **Document Parsing** - Parse PDFs, EPUBs, and web content
- **Translation** - Batch translate text blocks
- **Text-to-Speech** - Synthesize speech from text
- **State Management** - Zustand store for client-side state
- **React Hooks** - Custom hooks for Reader actions and TTS

## Architecture

```
Frontend (Client)
  ├── app/reader/stores/readerStore.ts      # Zustand state management
  ├── app/reader/hooks/useReaderActions.ts  # Reader actions hook
  ├── app/reader/hooks/useTTS.ts            # TTS functionality hook
  └── Components (to be integrated)

Backend (Server)
  ├── app/api/ingest/url/route.ts           # URL ingestion endpoint
  ├── app/api/reader/parse/route.ts         # Document parsing endpoint
  ├── app/api/translate/batch/route.ts      # Batch translation endpoint
  ├── app/api/tts/synthesize/route.ts       # TTS synthesis endpoint
  ├── lib/reader/ReaderEngine.ts            # Parsing orchestrator
  ├── lib/reader/adapters/ReaderAdapterStub.ts  # Format adapters (stub)
  ├── lib/storage/inMemoryDB.ts             # In-memory database
  ├── lib/cache/simpleCache.ts              # Simple caching
  └── lib/tts/provider.ts                   # TTS provider (stub)
```

## API Endpoints

### POST /api/ingest/url

Fetch and preview content from a URL.

**Request:**
```json
{
  "url": "https://example.com/article",
  "previewOnly": true,
  "previewTranslated": false,
  "targetLang": "zh"
}
```

**Response:**
```json
{
  "title": "Article Title",
  "blocks": [
    { "id": "p1", "order": 1, "text": "First paragraph..." },
    { "id": "p2", "order": 2, "text": "Second paragraph..." }
  ]
}
```

**Demo Path:**
- URL containing `/mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png` returns demo preview
- Useful for local testing without external network calls

**Security:**
- SSRF protection blocks private/local IPs (127.0.0.1, 10.*, 192.168.*, etc.)
- 10-second timeout
- 2MB response size limit for HTML

### POST /api/reader/parse

Parse a document and create a book.

**Request:**
```json
{
  "url": "https://example.com/document.pdf",
  "source": "web"
}
```

**Response:**
```json
{
  "bookId": "book-1234567890-abc123",
  "jobId": "job-1234567890"  // Optional, for async processing
}
```

**Demo Path:**
- Same demo path returns `bookId: "demo-book-1"`

### POST /api/translate/batch

Batch translate text blocks.

**Request:**
```json
{
  "items": [
    { "id": "p1", "text": "Hello world" },
    { "id": "p2", "text": "How are you?" }
  ],
  "targetLang": "zh"
}
```

**Response:**
```json
{
  "results": [
    { "id": "p1", "translated": "Hello world (ZH DEMO)" },
    { "id": "p2", "translated": "How are you? (ZH DEMO)" }
  ]
}
```

**Notes:**
- Currently returns demo translations (appends language suffix)
- Results are cached in SimpleCache
- To implement real translation, integrate with:
  - Google Cloud Translation API
  - DeepL API
  - OpenAI GPT-4

### POST /api/tts/synthesize

Synthesize text to speech.

**Request:**
```json
{
  "items": [
    { "id": "p1", "text": "Hello world" }
  ],
  "voiceId": "default",
  "rate": 1.0,
  "pitch": 1.0
}
```

**Response:**
```json
{
  "audioUrl": "data:audio/wav;base64,...",
  "metadata": {
    "rate": 1.0,
    "pitch": 1.0,
    "voiceId": "default",
    "duration": 0.1
  }
}
```

**Notes:**
- Currently returns silent audio for demo
- To implement real TTS, integrate with:
  - ElevenLabs API
  - Google Cloud Text-to-Speech
  - Azure Cognitive Services
  - Coqui TTS (self-hosted)

## Frontend Integration

### Using the Reader Store

```tsx
import { useReaderStore } from "@/app/reader/stores/readerStore"

function MyComponent() {
  const blocks = useReaderStore((state) => state.blocks)
  const currentIndex = useReaderStore((state) => state.currentIndex)
  const setCurrentIndex = useReaderStore((state) => state.setCurrentIndex)

  return (
    <div>
      {blocks.map((block, idx) => (
        <p
          key={block.id}
          data-id={block.id}
          className={idx === currentIndex ? 'active' : ''}
          onClick={() => setCurrentIndex(idx)}
        >
          {block.text}
        </p>
      ))}
    </div>
  )
}
```

### Using Reader Actions Hook

```tsx
import { useReaderActions } from "@/app/reader/hooks/useReaderActions"

function URLInput() {
  const { fetchPreview, importFromURL } = useReaderActions()
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)

  const handlePreview = async () => {
    setLoading(true)
    try {
      await fetchPreview(url)
      // Preview is now loaded in store
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    setLoading(true)
    try {
      await importFromURL(url)
      // Will navigate to /reader/{bookId}
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <input value={url} onChange={(e) => setUrl(e.target.value)} />
      <button onClick={handlePreview} disabled={loading}>
        Preview
      </button>
      <button onClick={handleImport} disabled={loading}>
        Import
      </button>
    </div>
  )
}
```

### Using TTS Hook

```tsx
import { useTTS } from "@/app/reader/hooks/useTTS"

function TTSControls() {
  const { play, pause, stop, setRate, isPlaying, rate } = useTTS()

  return (
    <div>
      {!isPlaying ? (
        <button onClick={play}>Play</button>
      ) : (
        <button onClick={pause}>Pause</button>
      )}
      <button onClick={stop}>Stop</button>

      <label>
        Speed: {rate}x
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={rate}
          onChange={(e) => setRate(parseFloat(e.target.value))}
        />
      </label>
    </div>
  )
}
```

### Using Translation

```tsx
import { useReaderStore } from "@/app/reader/stores/readerStore"

function TranslationPanel() {
  const blocks = useReaderStore((state) => state.blocks)
  const translateBlocks = useReaderStore((state) => state.translateBlocks)
  const translatedMap = useReaderStore((state) => state.translation.translatedMap)
  const [loading, setLoading] = useState(false)

  const handleTranslate = async () => {
    setLoading(true)
    try {
      const items = blocks.map((b) => ({ id: b.id, text: b.text }))
      await translateBlocks(items, "zh")
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={handleTranslate} disabled={loading}>
        Translate All
      </button>

      {blocks.map((block) => (
        <div key={block.id}>
          <p>{block.text}</p>
          {translatedMap[block.id] && (
            <p className="translation">{translatedMap[block.id]}</p>
          )}
        </div>
      ))}
    </div>
  )
}
```

## Swapping Stubs to Production

### Replace Reader Adapter

Current: `lib/reader/adapters/ReaderAdapterStub.ts`

Production options:
- **PDF**: Use `pdf-parse` or `pdfjs-dist`
- **EPUB**: Use `epub.js` or `epub2txt`
- **Web**: Use `@mozilla/readability`
- **DOCX**: Use `mammoth`

Example with Readability:

```typescript
import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"

async parseHTML(html: string, url?: string): Promise<ParseResult> {
  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  const paragraphs = article.textContent
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 20)

  const blocks = paragraphs.map((text, i) => ({
    id: `p-${i + 1}`,
    order: i + 1,
    text: text.trim(),
  }))

  return {
    blocks,
    metadata: {
      title: article.title,
      author: article.byline,
    },
  }
}
```

### Replace TTS Provider

Current: `lib/tts/provider.ts` (returns silent audio)

Production options:
1. **ElevenLabs** (high quality, paid)
2. **Google Cloud TTS** (good quality, pay-per-use)
3. **Azure Cognitive Services** (enterprise)
4. **Coqui TTS** (open-source, self-hosted)

Example with ElevenLabs:

```typescript
import { ElevenLabsClient } from "elevenlabs"

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })

async synthesize(items: TTSItem[], options: TTSOptions): Promise<TTSProviderResult> {
  const text = items.map((item) => item.text).join(" ")

  const audio = await client.textToSpeech.convert({
    voice_id: options.voiceId || "default",
    text,
    model_id: "eleven_monolingual_v1",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.5,
      speaking_rate: options.rate || 1.0,
    },
  })

  // Convert audio stream to data URI or upload to storage
  const audioBuffer = await streamToBuffer(audio)
  const audioUrl = await uploadToStorage(audioBuffer)

  return { audioUrl }
}
```

### Replace In-Memory Database

Current: `lib/storage/inMemoryDB.ts`

Production options:
- **PostgreSQL** with Prisma or Drizzle ORM
- **MongoDB** with Mongoose
- **Supabase** (PostgreSQL + real-time)

Example with Prisma:

```typescript
// prisma/schema.prisma
model Book {
  id String @id @default(uuid())
  title String?
  sourceUrl String?
  metadata Json?
  blocks Block[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Block {
  id String @id
  bookId String
  order Int
  text String @db.Text
  meta Json?
  book Book @relation(fields: [bookId], references: [id])
}

// lib/storage/prismaDB.ts
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function createBook(data: CreateBookInput) {
  return prisma.book.create({
    data: {
      ...data,
      blocks: {
        createMany: {
          data: data.blocks || [],
        },
      },
    },
  })
}
```

### Replace Translation

Current: Demo translations (appends language suffix)

Production options:
- **Google Cloud Translation**
- **DeepL API**
- **OpenAI GPT-4**

Example with OpenAI:

```typescript
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function translateBatch(items: TranslationItem[], targetLang: string) {
  const results = await Promise.all(
    items.map(async (item) => {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `Translate the following text to ${targetLang}. Return only the translation, no explanations.`,
          },
          {
            role: "user",
            content: item.text,
          },
        ],
      })

      return {
        id: item.id,
        translated: completion.choices[0].message.content,
      }
    })
  )

  return { results }
}
```

## Testing with Demo Path

For quick testing without external dependencies, use the demo path:

```typescript
const demoURL = "file:///mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png"

// This will return demo data:
// - 3 demo paragraphs
// - Title: "Demo Article from Local File"
// - bookId: "demo-book-1" (if using parse endpoint)
```

## Dependencies

Required packages (should already be installed):
- `zustand` - State management
- `next` - Next.js framework

Optional (for production):
- `@mozilla/readability` + `jsdom` - Web article extraction
- `pdf-parse` or `pdfjs-dist` - PDF parsing
- `epub.js` - EPUB parsing
- `mammoth` - DOCX parsing
- `elevenlabs` - TTS (ElevenLabs)
- `openai` - Translation/TTS (OpenAI)
- `@google-cloud/translate` - Translation (Google)
- `@google-cloud/text-to-speech` - TTS (Google)

## Next Steps

1. **Install Zustand**: `npm install zustand`
2. **Test Demo Endpoints**: Use the demo URL path to verify functionality
3. **Integrate with Components**: Update your UI components to use the store and hooks
4. **Swap Stubs**: Replace stub implementations with real providers
5. **Add Database**: Replace in-memory DB with PostgreSQL/MongoDB
6. **Add Authentication**: Protect API routes with auth middleware
7. **Add Rate Limiting**: Prevent abuse of expensive APIs (TTS, translation)
8. **Add Error Tracking**: Integrate Sentry or similar for error monitoring

## License

MIT
