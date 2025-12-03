# Testing Guide - Reader Core Features

Quick guide to test all Reader core functionality.

## Prerequisites

1. **Dev server running**: `npm run dev`
2. **Browser**: Open http://localhost:3000

## Quick Test - All Features

### Option 1: Use the Demo Page (Recommended)

Visit: **http://localhost:3000/reader-demo**

This page includes:
- ✅ URL ingestion with preview
- ✅ Translation
- ✅ TTS playback
- ✅ Interactive demo with tabs

**Steps:**
1. Click "Run Complete Demo" button
2. Watch as it automatically:
   - Fetches demo content
   - Translates all blocks
   - Starts TTS playback

### Option 2: Test APIs Manually

#### 1. Test URL Ingestion

```bash
# Windows PowerShell
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/url" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url":"file:///mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png","previewOnly":true}'
```

**Expected Response:**
```json
{
  "title": "Demo Article from Local File",
  "blocks": [
    {"id": "d1", "order": 1, "text": "Demo paragraph one."},
    {"id": "d2", "order": 2, "text": "Demo paragraph two."},
    {"id": "d3", "order": 3, "text": "Demo paragraph three."}
  ]
}
```

#### 2. Test Reader Parse

```bash
Invoke-RestMethod -Uri "http://localhost:3000/api/reader/parse" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url":"file:///mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png","source":"web"}'
```

**Expected Response:**
```json
{
  "bookId": "demo-book-1"
}
```

#### 3. Test Translation

```bash
$body = @{
  items = @(
    @{id="p1"; text="Hello world"},
    @{id="p2"; text="How are you?"}
  )
  targetLang = "zh"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/translate/batch" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

**Expected Response:**
```json
{
  "results": [
    {"id": "p1", "translated": "Hello world (ZH DEMO)"},
    {"id": "p2", "translated": "How are you? (ZH DEMO)"}
  ]
}
```

#### 4. Test TTS Synthesis

```bash
$body = @{
  items = @(
    @{id="p1"; text="Hello world"}
  )
  voiceId = "default"
  rate = 1.0
  pitch = 1.0
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/tts/synthesize" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

**Expected Response:**
```json
{
  "audioUrl": "data:audio/wav;base64,...",
  "metadata": {
    "rate": 1.0,
    "pitch": 1.0,
    "voiceId": "default"
  }
}
```

## Testing with Real URLs

### Test with a Real Website

```bash
# Replace with any public article URL
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/url" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url":"https://example.com/article","previewOnly":true}'
```

**Note:** Real URLs will be fetched and parsed using the stub implementation.

## Frontend Integration Testing

### Test Zustand Store

Create a test component:

```tsx
import { useReaderStore } from "@/app/reader/stores/readerStore"

export function StoreTest() {
  const blocks = useReaderStore((state) => state.blocks)
  const setBlocks = useReaderStore((state) => state.setBlocks)

  const testBlocks = [
    { id: "t1", order: 1, text: "Test block 1" },
    { id: "t2", order: 2, text: "Test block 2" },
  ]

  return (
    <div>
      <button onClick={() => setBlocks(testBlocks)}>
        Load Test Blocks
      </button>
      <div>Blocks: {blocks.length}</div>
    </div>
  )
}
```

### Test Hooks

```tsx
import { useReaderActions } from "@/app/reader/hooks/useReaderActions"

export function HookTest() {
  const { fetchPreview } = useReaderActions()

  return (
    <button onClick={() => fetchPreview("file:///mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png")}>
      Test Fetch Preview
    </button>
  )
}
```

## Common Issues & Solutions

### Issue: API returns 500 error

**Solution:** Check server logs in terminal where `npm run dev` is running.

### Issue: CORS error when fetching external URLs

**Solution:** This is expected for some URLs. The SSRF protection blocks private IPs. Use the demo URL for testing.

### Issue: Translation returns same text

**Solution:** This is the demo implementation. It appends `(ZH DEMO)` to show it's working.

### Issue: TTS plays silent audio

**Solution:** This is the demo implementation. Integrate with real TTS provider (ElevenLabs, Google Cloud TTS) for actual speech.

## Browser DevTools Testing

### Check Network Tab

1. Open DevTools (F12)
2. Go to Network tab
3. Trigger an API call
4. Look for:
   - `/api/ingest/url` - Status should be 200
   - `/api/reader/parse` - Status should be 200
   - `/api/translate/batch` - Status should be 200
   - `/api/tts/synthesize` - Status should be 200

### Check Console Tab

The demo page includes extensive logging:
- `[Ingest URL]` - URL fetching logs
- `[Reader Parse]` - Parsing logs
- `[Translate Batch]` - Translation logs
- `[TTS Synthesize]` - TTS logs
- `[Part X]` - Upload progress logs (from file upload feature)

## Performance Testing

### Test Large Documents

```bash
# Create a test with many blocks
$blocks = @()
for ($i=1; $i -le 100; $i++) {
  $blocks += @{id="p$i"; text="Paragraph $i content here"}
}

$body = @{
  items = $blocks
  targetLang = "zh"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/translate/batch" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

### Test Concurrent Requests

```bash
# Run multiple requests in parallel
1..5 | ForEach-Object -Parallel {
  Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/url" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"url":"file:///mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png","previewOnly":true}'
}
```

## Security Testing

### Test SSRF Protection

These should be blocked:

```bash
# Local IP - Should return 403
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/url" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url":"http://127.0.0.1:8080/secret"}'

# Private IP - Should return 403
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/url" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url":"http://192.168.1.1/admin"}'

# Localhost - Should return 403
Invoke-RestMethod -Uri "http://localhost:3000/api/ingest/url" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"url":"http://localhost:3000/api/secret"}'
```

All should return:
```json
{
  "error": "Access to private/local URLs is not allowed"
}
```

## Next Steps After Testing

1. **Integrate Real Parsers**:
   - Install `@mozilla/readability` for web articles
   - Install `pdf-parse` for PDFs
   - Install `epub.js` for EPUBs

2. **Integrate Real Translation**:
   - Set up Google Cloud Translation API
   - Or use OpenAI GPT-4
   - Or use DeepL API

3. **Integrate Real TTS**:
   - Set up ElevenLabs API
   - Or use Google Cloud Text-to-Speech
   - Or use Azure Cognitive Services

4. **Add Database**:
   - Replace `inMemoryDB` with PostgreSQL/MongoDB
   - Use Prisma or Drizzle ORM

5. **Add Authentication**:
   - Protect API routes with Next-Auth or similar
   - Add user-specific book storage

6. **Deploy to Production**:
   - Set up environment variables
   - Configure CORS for production domain
   - Set up monitoring and logging

## Troubleshooting Commands

```bash
# Check if server is running
Test-NetConnection -ComputerName localhost -Port 3000

# View server logs
# Look at the terminal where npm run dev is running

# Restart server if needed
# Press Ctrl+C in the terminal, then run npm run dev again
```

## Success Criteria

✅ Demo page loads at /reader-demo
✅ API endpoints return expected responses
✅ Zustand store updates correctly
✅ Hooks work without errors
✅ SSRF protection blocks private IPs
✅ Translation caching works
✅ TTS playback controls work

## Support

For issues or questions:
1. Check `docs/TASK2_README.md` for detailed documentation
2. Check server logs for error messages
3. Check browser console for client-side errors
