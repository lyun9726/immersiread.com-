# Large File Upload System

Complete implementation of a robust large file upload solution supporting files >50MB up to 10GB with automatic chunking, concurrent uploads, retry logic, and resume capability.

## Features

✅ **Multipart Upload** - Files are split into chunks (default 10MB) for reliable uploads
✅ **Direct to S3** - Files upload directly to S3/R2/Supabase using presigned URLs (bypasses server)
✅ **Concurrent Upload** - Upload multiple chunks simultaneously (default: 4 concurrent uploads)
✅ **Automatic Retry** - Failed chunks automatically retry with exponential backoff (up to 5 times)
✅ **Pause & Resume** - Pause uploads and resume from where you left off
✅ **Progress Tracking** - Real-time progress updates showing percentage and uploaded bytes
✅ **Large Files** - Supports files up to 10GB (configurable)
✅ **Type Safe** - Full TypeScript implementation

## Architecture

### Direct Upload Mode (Recommended)
```
Client → API (init) → Get Presigned URLs → Upload directly to S3 → API (complete) → Done
```

**Benefits:**
- Faster uploads (no server bottleneck)
- Lower server bandwidth costs
- Scalable to any number of concurrent users

### Component Structure

```
/app/api/upload/
  ├── init/route.ts          # Initialize upload session
  ├── presign-part/route.ts  # Get presigned URL for a part
  ├── complete/route.ts      # Complete multipart upload
  └── status/route.ts        # Query upload progress

/lib/storage/
  ├── s3Client.ts            # S3 client wrapper (AWS SDK v3)
  └── uploadUtils.ts         # Upload session management

/utils/
  └── tempFile.ts            # Temporary file utilities

/components/upload/
  └── large-file-uploader.tsx # Main upload component
```

## Setup

### 1. Install Dependencies

Already installed:
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 2. Configure Environment Variables

Create a `.env.local` file:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name

# Optional: Temp file directory
TEMP_UPLOAD_DIR=./.tmp/uploads
```

### 3. AWS S3 Bucket Setup

1. Create an S3 bucket in AWS Console
2. Enable CORS on your bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

3. Create IAM user with policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListMultipartUploadParts",
        "s3:AbortMultipartUpload"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:CreateMultipartUpload",
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name"
    }
  ]
}
```

## Usage

### In Your Component

```tsx
import { LargeFileUploader } from "@/components/upload/large-file-uploader"

export default function MyPage() {
  const handleUploadComplete = (fileUrl: string, key: string) => {
    console.log("Upload complete!", { fileUrl, key })
    // Process the uploaded file
  }

  const handleUploadError = (error: Error) => {
    console.error("Upload failed:", error)
  }

  return (
    <LargeFileUploader
      onComplete={handleUploadComplete}
      onError={handleUploadError}
      config={{
        partSize: 10 * 1024 * 1024, // 10MB chunks
        concurrency: 4,              // 4 simultaneous uploads
        maxRetries: 5,               // Retry up to 5 times
        mode: "direct",              // Direct to S3
      }}
      acceptedTypes={[".pdf", ".epub", ".txt", ".doc", ".docx"]}
    />
  )
}
```

### API Endpoints

#### POST /api/upload/init
Initialize upload session.

**Request:**
```json
{
  "filename": "example.pdf",
  "filesize": 123456789,
  "contentType": "application/pdf",
  "mode": "direct"
}
```

**Response:**
```json
{
  "uploadId": "uuid-here",
  "s3UploadId": "s3-upload-id",
  "key": "uploads/timestamp-uuid.pdf",
  "uploadMode": "direct",
  "partSize": 10485760,
  "totalParts": 12,
  "presignedParts": [
    { "partNumber": 1, "url": "https://..." },
    ...
  ]
}
```

#### POST /api/upload/presign-part
Get presigned URL for a specific part.

**Request:**
```json
{
  "uploadId": "uuid-here",
  "partNumber": 5
}
```

**Response:**
```json
{
  "partNumber": 5,
  "url": "https://...",
  "expiresIn": 900
}
```

#### POST /api/upload/complete
Complete the upload.

**Request:**
```json
{
  "uploadId": "uuid-here",
  "parts": [
    { "partNumber": 1, "etag": "abc123", "size": 10485760 },
    { "partNumber": 2, "etag": "def456", "size": 10485760 }
  ]
}
```

**Response:**
```json
{
  "status": "completed",
  "fileUrl": "https://your-bucket.s3.amazonaws.com/uploads/...",
  "key": "uploads/timestamp-uuid.pdf",
  "totalParts": 2,
  "filesize": 20971520
}
```

#### GET /api/upload/status?uploadId=xxx
Query upload progress.

**Response:**
```json
{
  "uploadId": "uuid-here",
  "status": "uploading",
  "filename": "example.pdf",
  "filesize": 123456789,
  "totalParts": 12,
  "uploadedParts": 7,
  "percentage": 58.33,
  "uploadedSize": 72089600,
  "remainingSize": 51367189
}
```

## Configuration

### Chunk Size Recommendations

| File Size | Recommended Chunk Size | Reason |
|-----------|------------------------|--------|
| < 100MB   | 5MB                    | Faster initialization |
| 100MB - 1GB | 10MB                 | Balanced |
| 1GB - 5GB | 20MB                   | Fewer parts to manage |
| > 5GB     | 50MB                   | S3 10,000 part limit |

### Concurrency Recommendations

| Network Speed | Recommended Concurrency |
|---------------|------------------------|
| < 10 Mbps     | 2-3                    |
| 10-50 Mbps    | 4-6                    |
| > 50 Mbps     | 6-8                    |

⚠️ **Note:** Higher concurrency = more browser memory usage

### Retry Strategy

The system uses exponential backoff:
- Retry 1: 1 second
- Retry 2: 2 seconds
- Retry 3: 4 seconds
- Retry 4: 8 seconds
- Retry 5: 16 seconds (capped at 30s max)

## Alternative Storage Providers

### Cloudflare R2

Update `lib/storage/s3Client.ts`:

```typescript
export const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // e.g., https://abc.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
})
```

Update `.env.local`:
```env
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
S3_BUCKET=your-r2-bucket
```

### Supabase Storage

Update `lib/storage/s3Client.ts` to use Supabase client instead of S3.

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Use supabase.storage.from('bucket-name') for operations
```

## Security

### Presigned URL Expiration
Default: 15 minutes (900 seconds). Adjust in `s3Client.ts`:

```typescript
export async function getPresignedUrlForPart(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn: number = 900 // Change this
)
```

### File Size Limits
Configure in `app/api/upload/init/route.ts`:

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024 // 10GB
```

### Authentication
Add authentication middleware to API routes:

```typescript
// Example with Next-Auth
import { getServerSession } from "next-auth"

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // ... rest of the handler
}
```

## Maintenance

### Cleanup Old Sessions
Run periodically (e.g., cron job):

```typescript
import { cleanupOldSessions } from "@/lib/storage/uploadUtils"
import { cleanupOldTempFiles } from "@/utils/tempFile"

// Clean up sessions older than 24 hours
const cleanedSessions = cleanupOldSessions(24 * 60 * 60 * 1000)

// Clean up temp files older than 24 hours
const cleanedFiles = await cleanupOldTempFiles(24 * 60 * 60 * 1000)
```

### Abort Incomplete Uploads
Create a cleanup script to abort S3 multipart uploads older than X days:

```typescript
import { S3Client, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3"

// List and abort old multipart uploads
const listCommand = new ListMultipartUploadsCommand({
  Bucket: S3_BUCKET,
})

const uploads = await s3Client.send(listCommand)
// Filter by date and abort old ones
```

## Troubleshooting

### CORS Errors
- Verify S3 bucket CORS configuration
- Check allowed origins include your domain
- Ensure `ExposeHeaders` includes `ETag`

### Upload Stuck at X%
- Check browser console for errors
- Verify presigned URLs haven't expired
- Check network tab for failed requests

### Memory Issues
- Reduce concurrency
- Reduce chunk size
- Close other tabs/applications

### Parts Not Completing
- Check S3 bucket permissions
- Verify IAM policy includes all necessary actions
- Check presigned URL expiration time

## Production Checklist

- [ ] Configure production S3 bucket
- [ ] Set up proper IAM roles with minimal permissions
- [ ] Configure CORS for production domain
- [ ] Add authentication to API routes
- [ ] Set up monitoring/logging
- [ ] Configure CDN (CloudFront) for file delivery
- [ ] Implement cleanup cron jobs
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure rate limiting
- [ ] Test with various file sizes
- [ ] Test with slow networks
- [ ] Test pause/resume functionality

## Performance Tips

1. **Use CDN**: Serve uploaded files via CloudFront/CDN
2. **Optimize Chunk Size**: Larger chunks = fewer API calls but more memory
3. **Parallel Processing**: Process files async after upload
4. **Cache Presigned URLs**: Generate multiple at once (done by default)
5. **Use Redis**: Store sessions in Redis for production (instead of in-memory)

## License

MIT
