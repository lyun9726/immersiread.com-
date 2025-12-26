# EPUB Bilingual Translation Service

A Railway-deployed service for translating EPUB files to bilingual format.

## Features

- Accepts EPUB file URL and translates text content
- Injects bilingual text (original + translation) into EPUB structure
- Uploads completed bilingual EPUB to S3
- Sends callback to Vercel when complete

## Deployment to Railway

1. Create a new Railway project
2. Add this service from the `services/epub-translate` directory
3. Configure environment variables:

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | DeepSeek API key (or OpenAI API key) |
| `OPENAI_BASE_URL` | API base URL (e.g., `https://api.deepseek.com/v1`) |
| `OPENAI_MODEL` | Model name (e.g., `deepseek-chat`) |
| `AWS_ACCESS_KEY_ID` | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key |
| `AWS_REGION` | S3 region (e.g., `ap-southeast-1`) |
| `S3_BUCKET` | S3 bucket name |
| `VERCEL_PROTECTION_BYPASS` | (Optional) Vercel protection bypass token |

4. Deploy the service
5. Copy the Railway public URL
6. Add `EPUB_TRANSLATE_SERVICE_URL` to your Vercel environment:
   ```
   EPUB_TRANSLATE_SERVICE_URL=https://your-service.railway.app
   ```

## API Endpoints

### `GET /health`
Health check endpoint.

### `POST /translate`
Start a translation job.

**Request:**
```json
{
  "bookId": "abc123",
  "epubUrl": "https://..../book.epub",
  "callbackUrl": "https://your-app.vercel.app/api/translate/epub-bilingual/callback"
}
```

**Response:**
```json
{
  "jobId": "uuid",
  "status": "pending",
  "message": "Translation job started"
}
```

### `GET /status/{jobId}`
Check job status.

**Response:**
```json
{
  "jobId": "uuid",
  "status": "processing|completed|failed",
  "progress": 50,
  "bilingualUrl": "https://s3.../bilingual.epub",
  "error": null
}
```

## Callback Payload

When translation completes, the service sends a POST to the callback URL:

```json
{
  "bookId": "abc123",
  "status": "completed",
  "bilingualUrl": "https://s3.../bilingual.epub"
}
```

Or on failure:
```json
{
  "bookId": "abc123", 
  "status": "failed",
  "error": "Error message"
}
```
