"use client"

/**
 * Large File Uploader Component
 * Supports multipart upload with chunking, concurrency, retry, and resume
 */

import React, { useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Upload, X, CheckCircle2, AlertCircle, Pause, Play } from "lucide-react"
import { pdfjs } from 'react-pdf'

// Configure worker - Use local file for reliability
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

interface UploadPart {
  partNumber: number
  etag: string
  size: number
  status: "pending" | "uploading" | "completed" | "failed"
  retries: number
  url?: string
}

interface UploadConfig {
  partSize?: number
  concurrency?: number
  maxRetries?: number
  mode?: "direct" | "server"
}

interface LargeFileUploaderProps {
  onComplete?: (fileUrl: string, key: string, originalFilename: string, coverImage?: string) => void
  onError?: (error: Error) => void
  config?: UploadConfig
  acceptedTypes?: string[]
}

const DEFAULT_CONFIG: Required<UploadConfig> = {
  partSize: 10 * 1024 * 1024, // 10MB
  concurrency: 4,
  maxRetries: 5,
  mode: "direct",
}

export function LargeFileUploader({
  onComplete,
  onError,
  config = {},
  acceptedTypes = [".pdf", ".epub", ".txt", ".doc", ".docx"],
}: LargeFileUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploadId, setUploadId] = useState<string>("")
  const [s3UploadId, setS3UploadId] = useState<string>("")
  const [key, setKey] = useState<string>("")
  const [parts, setParts] = useState<UploadPart[]>([])
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<"idle" | "uploading" | "paused" | "completed" | "failed">(
    "idle"
  )
  const [error, setError] = useState<string>("")
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map())
  const completedPartsRef = useRef<Array<{ partNumber: number; etag: string; size: number }>>([])
  const uploadIdRef = useRef<string>("")
  const keyRef = useRef<string>("")

  const uploadConfig = { ...DEFAULT_CONFIG, ...config }

  /**
   * Initialize upload session
   * Returns init response which could be simple PUT or multipart
   */
  const initializeUpload = async (selectedFile: File): Promise<any> => {
    try {
      const response = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          filesize: selectedFile.size,
          contentType: selectedFile.type || "application/octet-stream",
          mode: uploadConfig.mode,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to initialize upload")
      }

      const data = await response.json()
      console.log("[Init] Upload initialized:", data)

      // For simple upload, just return the data
      if (data.uploadType === "simple") {
        return data
      }

      // For multipart, set up the parts
      uploadIdRef.current = data.uploadId
      keyRef.current = data.key

      setUploadId(data.uploadId)
      setS3UploadId(data.s3UploadId)
      setKey(data.key)

      // Initialize parts
      const totalParts = data.totalParts
      const initialParts: UploadPart[] = []

      for (let i = 1; i <= totalParts; i++) {
        const presignedPart = data.presignedParts?.find((p: any) => p.partNumber === i)
        initialParts.push({
          partNumber: i,
          etag: "",
          size: 0,
          status: "pending",
          retries: 0,
          url: presignedPart?.url,
        })
      }

      console.log(`[Init] Created ${initialParts.length} parts for multipart upload`)

      setParts(initialParts)

      // Return both init data and parts for the caller
      return { ...data, parts: initialParts }
    } catch (err) {
      throw err
    }
  }

  /**
   * Get presigned URL for a part (if not pre-generated)
   */
  const getPresignedUrl = async (partNumber: number): Promise<string> => {
    const response = await fetch("/api/upload/presign-part", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId: uploadIdRef.current, partNumber }),
    })

    if (!response.ok) {
      throw new Error("Failed to get presigned URL")
    }

    const data = await response.json()
    return data.url
  }

  /**
   * Upload single part with retry logic
   */
  const uploadPart = async (part: UploadPart, fileData: File): Promise<void> => {
    const { partNumber, retries } = part
    const start = (partNumber - 1) * uploadConfig.partSize
    const end = Math.min(start + uploadConfig.partSize, fileData.size)
    const chunk = fileData.slice(start, end)

    console.log(`[Part ${partNumber}] Starting upload, size: ${chunk.size} bytes`)

    // Update part status
    setParts((prev) =>
      prev.map((p) => (p.partNumber === partNumber ? { ...p, status: "uploading" as const } : p))
    )

    try {
      // Get presigned URL if not available
      let url = part.url
      if (!url) {
        console.log(`[Part ${partNumber}] Fetching presigned URL`)
        url = await getPresignedUrl(partNumber)
      }

      console.log(`[Part ${partNumber}] Uploading to S3:`, url.substring(0, 100) + "...")

      // Create abort controller for this part
      const controller = new AbortController()
      abortControllersRef.current.set(partNumber, controller)

      // Upload chunk to S3 presigned URL
      // IMPORTANT: Do not add Content-Type header for multipart uploads
      // The presigned URL does not include it, so adding it causes signature mismatch
      const uploadResponse = await fetch(url, {
        method: "PUT",
        body: chunk,
        signal: controller.signal,
      })

      console.log(`[Part ${partNumber}] Response status:`, uploadResponse.status)

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        console.error(`[Part ${partNumber}] Upload failed:`, errorText)
        throw new Error(`Part ${partNumber} upload failed: ${uploadResponse.statusText}`)
      }

      // Get ETag from response
      const etag = uploadResponse.headers.get("ETag") || ""
      console.log(`[Part ${partNumber}] Success! ETag:`, etag)

      if (!etag) {
        throw new Error(`Part ${partNumber}: No ETag received from S3`)
      }

      const cleanEtag = etag.replace(/"/g, "")

      // Update part status
      setParts((prev) =>
        prev.map((p) =>
          p.partNumber === partNumber
            ? { ...p, status: "completed" as const, etag: cleanEtag, size: chunk.size }
            : p
        )
      )

      // Add to completed parts ref (for reliable completion)
      completedPartsRef.current.push({
        partNumber,
        etag: cleanEtag,
        size: chunk.size,
      })

      console.log(`[Part ${partNumber}] Added to completed parts (${completedPartsRef.current.length} total)`)

      // Update progress
      setUploadedBytes((prev) => prev + chunk.size)

      // Cleanup abort controller
      abortControllersRef.current.delete(partNumber)
    } catch (err) {
      // Handle abort
      if ((err as Error).name === "AbortError") {
        setParts((prev) =>
          prev.map((p) => (p.partNumber === partNumber ? { ...p, status: "pending" as const } : p))
        )
        return
      }

      // Retry logic with exponential backoff
      if (retries < uploadConfig.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retries), 30000) // Max 30s
        await new Promise((resolve) => setTimeout(resolve, delay))

        setParts((prev) =>
          prev.map((p) =>
            p.partNumber === partNumber ? { ...p, retries: retries + 1, status: "pending" as const } : p
          )
        )

        return uploadPart(
          { ...part, retries: retries + 1 },
          fileData
        )
      }

      // Mark as failed after max retries
      setParts((prev) =>
        prev.map((p) => (p.partNumber === partNumber ? { ...p, status: "failed" as const } : p))
      )

      throw new Error(`Part ${partNumber} failed after ${uploadConfig.maxRetries} retries`)
    }
  }

  /**
   * Upload all parts with concurrency control
   */
  const uploadAllParts = async (fileData: File, partsToUpload: UploadPart[]): Promise<void> => {
    console.log(`[Upload] Starting to upload ${partsToUpload.length} parts`)

    const pendingParts = partsToUpload.filter((p) => p.status === "pending")
    const queue = [...pendingParts]
    const active: Promise<void>[] = []

    console.log(`[Upload] ${queue.length} parts in queue`)

    while (queue.length > 0 || active.length > 0) {
      // Check if paused
      if (isPaused) {
        console.log("[Upload] Paused, aborting active uploads")
        // Abort all active uploads
        abortControllersRef.current.forEach((controller) => controller.abort())
        abortControllersRef.current.clear()
        return
      }

      // Fill up to concurrency limit
      while (active.length < uploadConfig.concurrency && queue.length > 0) {
        const part = queue.shift()!
        const promise = uploadPart(part, fileData).then(() => {
          const index = active.indexOf(promise)
          if (index > -1) active.splice(index, 1)
        })
        active.push(promise)
      }

      // Wait for at least one to complete
      if (active.length > 0) {
        await Promise.race(active)
      }
    }

    console.log("[Upload] All parts uploaded!")
  }

  /**
   * Complete upload
   */
  const completeUpload = async (): Promise<{ fileUrl: string; key: string }> => {
    // Use refs to get data (reliable, not dependent on state updates)
    const completedParts = completedPartsRef.current
    const currentUploadId = uploadIdRef.current

    console.log("[Complete] Sending completion request with parts:", completedParts.length)
    console.log("[Complete] Upload ID:", currentUploadId)

    if (!currentUploadId) {
      throw new Error("Upload ID is missing")
    }

    if (completedParts.length === 0) {
      throw new Error("No parts to complete")
    }

    const response = await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadId: currentUploadId,
        parts: completedParts,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("[Complete] Completion failed:", errorData)
      throw new Error(errorData.error || "Failed to complete upload")
    }

    const data = await response.json()
    console.log("[Complete] Completion successful:", data)
    return data
  }

  /**
   * Main upload handler
   */
  const handleUpload = async (selectedFile: File) => {
    try {
      console.log("[Upload] Starting upload for:", selectedFile.name, selectedFile.size, "bytes")

      setStatus("uploading")
      setError("")
      setUploadedBytes(0)
      setIsPaused(false)

      // Clear data from previous uploads
      completedPartsRef.current = []
      uploadIdRef.current = ""
      keyRef.current = ""

      // Initialize upload - returns different response based on file size
      const initData = await initializeUpload(selectedFile)

      let result: { fileUrl: string; key: string }

      // ============================================
      // SIMPLE UPLOAD PATH (< 5MB)
      // ============================================
      if (initData.uploadType === "simple") {
        console.log("[Upload] Using simple PUT upload")

        // Direct PUT upload to S3
        const uploadResponse = await fetch(initData.presignedUrl, {
          method: "PUT",
          body: selectedFile,
          headers: {
            "Content-Type": selectedFile.type || "application/octet-stream",
          },
        })

        if (!uploadResponse.ok) {
          throw new Error(`Simple upload failed: ${uploadResponse.status}`)
        }

        console.log("[Upload] Simple upload completed!")
        result = { fileUrl: initData.fileUrl, key: initData.key }
      } else {
        // ============================================
        // MULTIPART UPLOAD PATH (>= 5MB)
        // ============================================
        console.log("[Upload] Using multipart upload")

        // Upload all parts
        await uploadAllParts(selectedFile, initData.parts)

        // Check if paused
        if (isPaused) {
          setStatus("paused")
          return
        }

        // Complete multipart upload
        console.log("[Upload] Completing multipart upload...")
        result = await completeUpload()
      }

      setStatus("completed")
      setProgress(100)

      console.log("[Upload] Upload completed successfully!")

      // Try to generate thumbnail for PDF files
      let coverImage: string | undefined
      if (selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')) {
        try {
          console.log("[Upload] Generating PDF thumbnail client-side...")
          const arrayBuffer = await selectedFile.arrayBuffer()
          // Use standard font data and CMaps to ensure correct rendering
          const cMapUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`
          const standardFontDataUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`

          const loadingTask = pdfjs.getDocument({
            data: arrayBuffer,
            cMapUrl,
            cMapPacked: true,
            standardFontDataUrl
          })
          const pdf = await loadingTask.promise
          const page = await pdf.getPage(1)
          const scale = 1.5
          const viewport = page.getViewport({ scale })

          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          canvas.height = viewport.height
          canvas.width = viewport.width

          if (context) {
            const renderContext: any = {
              canvasContext: context,
              viewport: viewport
            }
            await page.render(renderContext).promise
            coverImage = canvas.toDataURL('image/jpeg', 0.8)
            console.log("[Upload] PDF thumbnail generated successfully")
          }
        } catch (e) {
          console.error("[Upload] Failed to generate PDF thumbnail:", e)
        }
      }

      if (onComplete) {
        onComplete(result.fileUrl, result.key, selectedFile.name, coverImage)
      }
    } catch (err) {
      const errorMessage = (err as Error).message
      console.error("[Upload] Upload failed:", errorMessage)
      setError(errorMessage)
      setStatus("failed")

      if (onError) {
        onError(err as Error)
      }
    }
  }

  /**
   * Handle file selection
   */
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setStatus("idle")
      setProgress(0)
      setError("")
    }
  }

  /**
   * Start upload
   */
  const startUpload = () => {
    if (file && status === "idle") {
      handleUpload(file)
    }
  }

  /**
   * Pause upload
   */
  const pauseUpload = () => {
    setIsPaused(true)
    setStatus("paused")
  }

  /**
   * Resume upload
   */
  const resumeUpload = () => {
    if (file && status === "paused") {
      setIsPaused(false)
      handleUpload(file)
    }
  }

  /**
   * Cancel upload
   */
  const cancelUpload = () => {
    abortControllersRef.current.forEach((controller) => controller.abort())
    abortControllersRef.current.clear()
    completedPartsRef.current = []
    uploadIdRef.current = ""
    keyRef.current = ""
    setFile(null)
    setStatus("idle")
    setProgress(0)
    setParts([])
    setError("")
  }

  // Calculate progress
  React.useEffect(() => {
    if (file && file.size > 0) {
      const progressPercentage = (uploadedBytes / file.size) * 100
      setProgress(Math.min(progressPercentage, 100))
    }
  }, [uploadedBytes, file])

  return (
    <div className="space-y-4">
      {/* File Input */}
      {!file && (
        <div className="border-2 border-dashed rounded-xl p-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={acceptedTypes.join(",")}
            onChange={handleFileSelect}
          />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Choose a file to upload</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Supports files up to 10GB
              </p>
            </div>
            <Button onClick={() => fileInputRef.current?.click()}>Select File</Button>
          </div>
        </div>
      )}

      {/* File Info and Upload Progress */}
      {file && (
        <div className="border rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-semibold truncate">{file.name}</h3>
              <p className="text-sm text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            {status === "idle" && (
              <Button variant="ghost" size="icon" onClick={cancelUpload}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Progress Bar */}
          {(status === "uploading" || status === "paused" || status === "completed") && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{progress.toFixed(1)}%</span>
                <span>
                  {(uploadedBytes / (1024 * 1024)).toFixed(2)} /{" "}
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            </div>
          )}

          {/* Status Message */}
          {status === "completed" && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Upload completed successfully!</span>
            </div>
          )}

          {status === "failed" && (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {status === "idle" && (
              <Button onClick={startUpload} className="flex-1">
                <Upload className="h-4 w-4 mr-2" />
                Start Upload
              </Button>
            )}

            {status === "uploading" && (
              <Button onClick={pauseUpload} variant="outline" className="flex-1">
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}

            {status === "paused" && (
              <>
                <Button onClick={resumeUpload} className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </Button>
                <Button onClick={cancelUpload} variant="outline">
                  Cancel
                </Button>
              </>
            )}

            {(status === "completed" || status === "failed") && (
              <Button onClick={cancelUpload} variant="outline" className="flex-1">
                Upload Another File
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
