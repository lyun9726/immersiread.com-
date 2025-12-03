"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { LinkIcon, CheckCircle } from "lucide-react"
import { LargeFileUploader } from "@/components/upload/large-file-uploader"
import { useRouter } from "next/navigation"

export default function UploadPage() {
  const [urlInput, setUrlInput] = useState("")
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [uploadedFileUrl, setUploadedFileUrl] = useState("")
  const router = useRouter()

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Processing URL:", urlInput)
    // TODO: Initiate URL ingest
  }

  const handleUploadComplete = async (fileUrl: string, key: string) => {
    console.log("Upload complete!", { fileUrl, key })
    setUploadSuccess(true)
    setUploadedFileUrl(fileUrl)

    // Parse uploaded file and create book entry
    try {
      const response = await fetch("/api/reader/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fileUrl,
          source: "upload",
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log("Book created:", data.bookId)

        // Navigate to library after a short delay to show success message
        setTimeout(() => {
          router.push("/library")
        }, 2000)
      }
    } catch (error) {
      console.error("Failed to process uploaded file:", error)
      // Still show success message for upload, but don't navigate
    }
  }

  const handleUploadError = (error: Error) => {
    console.error("Upload error:", error)
    // Error is already shown in the component
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Add Content</h1>
        <p className="text-muted-foreground">
          Upload large files (up to 10GB) with automatic chunking and resume support
        </p>
      </div>

      <div className="grid gap-8">
        {/* Large File Upload Component */}
        <LargeFileUploader
          onComplete={handleUploadComplete}
          onError={handleUploadError}
          config={{
            partSize: 10 * 1024 * 1024, // 10MB chunks
            concurrency: 4, // Upload 4 chunks simultaneously
            maxRetries: 5, // Retry failed chunks up to 5 times
            mode: "direct", // Direct upload to S3
          }}
          acceptedTypes={[".pdf", ".epub", ".txt", ".doc", ".docx", ".mobi"]}
        />

        {/* Success Message */}
        {uploadSuccess && (
          <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">Upload Successful!</h3>
                  <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                    Your file has been uploaded and is being added to your library. Redirecting...
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 break-all">{uploadedFileUrl}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or import from web</span>
          </div>
        </div>

        {/* URL Input */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleUrlSubmit} className="flex gap-4 items-end">
              <div className="grid w-full items-center gap-1.5">
                <label htmlFor="url" className="text-sm font-medium">
                  Article or Webpage URL
                </label>
                <div className="relative">
                  <LinkIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="url"
                    placeholder="https://example.com/article"
                    className="pl-9"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit">Import</Button>
            </form>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
