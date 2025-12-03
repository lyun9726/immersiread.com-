/**
 * Upload Utilities and Helpers
 * Handles multipart upload logic, session management, and part tracking
 * Now with file-based persistence to survive hot reloads
 */

import { randomUUID } from "crypto"
import fs from "fs"
import path from "path"

export const DEFAULT_PART_SIZE = 10 * 1024 * 1024 // 10MB
export const MIN_PART_SIZE = 5 * 1024 * 1024 // 5MB (S3 minimum)
export const MAX_PART_SIZE = 100 * 1024 * 1024 // 100MB

const SESSIONS_FILE = path.join(process.cwd(), ".tmp", "upload-sessions.json")

// In-memory store for upload sessions (use Redis/DB in production)
interface UploadSession {
  uploadId: string
  s3UploadId: string
  key: string
  filename: string
  filesize: number
  contentType: string
  partSize: number
  totalParts: number
  uploadedParts: Map<number, { etag: string; size: number }>
  mode: "direct" | "server"
  status: "pending" | "uploading" | "completed" | "failed"
  createdAt: Date
  completedAt?: Date
}

class SessionStore {
  private sessions = new Map<string, UploadSession>()

  constructor() {
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"))
        for (const [id, session] of Object.entries(data)) {
          const s = session as any
          this.sessions.set(id, {
            ...s,
            uploadedParts: new Map(Object.entries(s.uploadedParts || {})),
            createdAt: new Date(s.createdAt),
            completedAt: s.completedAt ? new Date(s.completedAt) : undefined,
          })
        }
        console.log(`[UploadSessions] Loaded ${this.sessions.size} sessions from disk`)
      }
    } catch (error) {
      console.error("[UploadSessions] Error loading sessions:", error)
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(SESSIONS_FILE)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const data: any = {}
      for (const [id, session] of this.sessions.entries()) {
        data[id] = {
          ...session,
          uploadedParts: Object.fromEntries(session.uploadedParts),
        }
      }

      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error("[UploadSessions] Error saving sessions:", error)
    }
  }

  get(id: string): UploadSession | undefined {
    return this.sessions.get(id)
  }

  set(id: string, session: UploadSession): void {
    this.sessions.set(id, session)
    this.save()
  }

  delete(id: string): boolean {
    const result = this.sessions.delete(id)
    this.save()
    return result
  }

  entries(): IterableIterator<[string, UploadSession]> {
    return this.sessions.entries()
  }
}

const uploadSessions = new SessionStore()

/**
 * Calculate optimal part size based on file size
 */
export function calculatePartSize(filesize: number): number {
  // S3 allows max 10,000 parts
  const maxParts = 10000
  let partSize = DEFAULT_PART_SIZE

  // If file would exceed max parts, increase part size
  if (filesize / partSize > maxParts) {
    partSize = Math.ceil(filesize / maxParts)
    // Round up to nearest MB
    partSize = Math.ceil(partSize / (1024 * 1024)) * (1024 * 1024)
  }

  // Ensure minimum part size (except last part)
  if (partSize < MIN_PART_SIZE) {
    partSize = MIN_PART_SIZE
  }

  // Cap at maximum part size
  if (partSize > MAX_PART_SIZE) {
    partSize = MAX_PART_SIZE
  }

  return partSize
}

/**
 * Calculate total number of parts
 */
export function calculateTotalParts(filesize: number, partSize: number): number {
  return Math.ceil(filesize / partSize)
}

/**
 * Generate unique file key for S3
 */
export function generateFileKey(filename: string): string {
  const timestamp = Date.now()
  const uuid = randomUUID()
  const ext = filename.split(".").pop() || ""
  return `uploads/${timestamp}-${uuid}.${ext}`
}

/**
 * Create upload session
 */
export function createUploadSession(params: {
  s3UploadId: string
  key: string
  filename: string
  filesize: number
  contentType: string
  mode: "direct" | "server"
}): UploadSession {
  const uploadId = randomUUID()
  const partSize = calculatePartSize(params.filesize)
  const totalParts = calculateTotalParts(params.filesize, partSize)

  const session: UploadSession = {
    uploadId,
    s3UploadId: params.s3UploadId,
    key: params.key,
    filename: params.filename,
    filesize: params.filesize,
    contentType: params.contentType,
    partSize,
    totalParts,
    uploadedParts: new Map(),
    mode: params.mode,
    status: "pending",
    createdAt: new Date(),
  }

  uploadSessions.set(uploadId, session)
  return session
}

/**
 * Get upload session
 */
export function getUploadSession(uploadId: string): UploadSession | undefined {
  return uploadSessions.get(uploadId)
}

/**
 * Update uploaded part
 */
export function updateUploadedPart(
  uploadId: string,
  partNumber: number,
  etag: string,
  size: number
): boolean {
  const session = uploadSessions.get(uploadId)
  if (!session) return false

  session.uploadedParts.set(partNumber, { etag, size })
  session.status = "uploading"
  uploadSessions.set(uploadId, session)
  return true
}

/**
 * Check if upload is complete
 */
export function isUploadComplete(uploadId: string): boolean {
  const session = uploadSessions.get(uploadId)
  if (!session) return false

  return session.uploadedParts.size === session.totalParts
}

/**
 * Get uploaded parts as array (sorted by part number)
 */
export function getUploadedParts(uploadId: string): Array<{ PartNumber: number; ETag: string }> {
  const session = uploadSessions.get(uploadId)
  if (!session) return []

  return Array.from(session.uploadedParts.entries())
    .map(([partNumber, { etag }]) => ({
      PartNumber: partNumber,
      ETag: etag,
    }))
    .sort((a, b) => a.PartNumber - b.PartNumber)
}

/**
 * Mark upload as completed
 */
export function completeUploadSession(uploadId: string): boolean {
  const session = uploadSessions.get(uploadId)
  if (!session) return false

  session.status = "completed"
  session.completedAt = new Date()
  uploadSessions.set(uploadId, session)
  return true
}

/**
 * Mark upload as failed
 */
export function failUploadSession(uploadId: string): boolean {
  const session = uploadSessions.get(uploadId)
  if (!session) return false

  session.status = "failed"
  uploadSessions.set(uploadId, session)
  return true
}

/**
 * Delete upload session
 */
export function deleteUploadSession(uploadId: string): boolean {
  return uploadSessions.delete(uploadId)
}

/**
 * Cleanup old sessions (call periodically)
 */
export function cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const now = Date.now()
  let cleaned = 0

  for (const [uploadId, session] of uploadSessions.entries()) {
    const age = now - session.createdAt.getTime()
    if (age > maxAgeMs && session.status !== "uploading") {
      uploadSessions.delete(uploadId)
      cleaned++
    }
  }

  return cleaned
}

/**
 * Get upload progress
 */
export function getUploadProgress(uploadId: string): {
  totalParts: number
  uploadedParts: number
  percentage: number
  uploadedSize: number
  totalSize: number
} {
  const session = uploadSessions.get(uploadId)
  if (!session) {
    return {
      totalParts: 0,
      uploadedParts: 0,
      percentage: 0,
      uploadedSize: 0,
      totalSize: 0,
    }
  }

  const uploadedSize = Array.from(session.uploadedParts.values()).reduce(
    (sum, part) => sum + part.size,
    0
  )

  return {
    totalParts: session.totalParts,
    uploadedParts: session.uploadedParts.size,
    percentage: (session.uploadedParts.size / session.totalParts) * 100,
    uploadedSize,
    totalSize: session.filesize,
  }
}
