/**
 * Temporary File Utilities
 * Handles streaming writes to temp files to avoid memory OOM
 */

import fs from "fs"
import path from "path"
import { randomUUID } from "crypto"
import { Readable } from "stream"
import { pipeline } from "stream/promises"

const TEMP_DIR = process.env.TEMP_UPLOAD_DIR || path.join(process.cwd(), ".tmp", "uploads")

/**
 * Ensure temp directory exists
 */
export function ensureTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true })
  }
}

/**
 * Generate temp file path
 */
export function getTempFilePath(prefix: string = "upload"): string {
  ensureTempDir()
  const filename = `${prefix}-${randomUUID()}`
  return path.join(TEMP_DIR, filename)
}

/**
 * Write buffer to temp file (streaming)
 */
export async function writeTempFile(data: Buffer | Uint8Array): Promise<string> {
  const tempPath = getTempFilePath()
  await fs.promises.writeFile(tempPath, data)
  return tempPath
}

/**
 * Stream data to temp file
 */
export async function streamToTempFile(stream: Readable): Promise<string> {
  const tempPath = getTempFilePath()
  const writeStream = fs.createWriteStream(tempPath)

  await pipeline(stream, writeStream)
  return tempPath
}

/**
 * Append data to existing temp file
 */
export async function appendToTempFile(filePath: string, data: Buffer | Uint8Array): Promise<void> {
  await fs.promises.appendFile(filePath, data)
}

/**
 * Read temp file as buffer
 */
export async function readTempFile(filePath: string): Promise<Buffer> {
  return await fs.promises.readFile(filePath)
}

/**
 * Create read stream from temp file
 */
export function createTempFileReadStream(filePath: string): fs.ReadStream {
  return fs.createReadStream(filePath)
}

/**
 * Delete temp file
 */
export async function deleteTempFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath)
  } catch (error) {
    // Ignore error if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }
}

/**
 * Delete multiple temp files
 */
export async function deleteTempFiles(filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map((path) => deleteTempFile(path)))
}

/**
 * Cleanup old temp files
 */
export async function cleanupOldTempFiles(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  ensureTempDir()
  const files = await fs.promises.readdir(TEMP_DIR)
  const now = Date.now()
  let cleaned = 0

  for (const file of files) {
    const filePath = path.join(TEMP_DIR, file)
    try {
      const stats = await fs.promises.stat(filePath)
      const age = now - stats.mtimeMs

      if (age > maxAgeMs) {
        await fs.promises.unlink(filePath)
        cleaned++
      }
    } catch (error) {
      // Ignore errors
    }
  }

  return cleaned
}

/**
 * Get temp file size
 */
export async function getTempFileSize(filePath: string): Promise<number> {
  const stats = await fs.promises.stat(filePath)
  return stats.size
}

/**
 * Check if temp file exists
 */
export async function tempFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Merge multiple temp files into one
 */
export async function mergeTempFiles(sourcePaths: string[], targetPath: string): Promise<void> {
  const writeStream = fs.createWriteStream(targetPath)

  for (const sourcePath of sourcePaths) {
    const readStream = fs.createReadStream(sourcePath)
    await pipeline(readStream, writeStream, { end: false })
  }

  writeStream.end()

  // Wait for write stream to finish
  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve)
    writeStream.on("error", reject)
  })
}

/**
 * Convert Request body to buffer (for Next.js API routes)
 */
export async function requestBodyToBuffer(request: Request): Promise<Buffer> {
  const arrayBuffer = await request.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Save uploaded file from FormData
 */
export async function saveUploadedFile(file: File): Promise<string> {
  const tempPath = getTempFilePath(file.name)
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.promises.writeFile(tempPath, buffer)
  return tempPath
}
