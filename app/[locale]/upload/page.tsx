"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LinkIcon, CheckCircle, UploadCloud, ArrowRight } from "lucide-react"
import { LargeFileUploader } from "@/components/upload/large-file-uploader"
import { useRouter } from "next/navigation"

export default function UploadPage() {
  const [urlInput, setUrlInput] = useState("")
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [uploadedFileUrl, setUploadedFileUrl] = useState("")
  const [isUrlInputFocused, setIsUrlInputFocused] = useState(false)
  const router = useRouter()

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Processing URL:", urlInput)
    // TODO: Initiate URL ingest
  }

  const handleUploadComplete = async (fileUrl: string, key: string, originalFilename: string, coverImage?: string) => {
    console.log("Upload complete!", { fileUrl, key, originalFilename, hasCover: !!coverImage })
    setUploadSuccess(true)
    setUploadedFileUrl(fileUrl)

    // Parse uploaded file and create book entry
    try {
      const response = await fetch("/api/reader/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fileUrl,
          originalFilename,
          coverImage, // Pass the client-generated cover
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
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Mesh Gradient */}
      <div className="absolute inset-0 -z-10 bg-background">
        <div className="absolute top-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] h-[500px] w-[500px] rounded-full bg-blue-500/20 blur-[120px]" />
      </div>

      <div className="container mx-auto px-6 py-16 max-w-5xl">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent">
            Add New Content
          </h1>
          <p className="text-xl text-muted-foreground/80 max-w-2xl">
            Import books, papers, or articles. We support files up to 10GB with AI-powered processing.
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-8">
            {/* Glass Card for File Upload */}
            <div className="relative group rounded-3xl border border-white/20 bg-white/40 dark:bg-black/20 backdrop-blur-xl shadow-xl transition-all duration-500 hover:shadow-2xl hover:bg-white/50 dark:hover:bg-black/30 p-1">
              <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-white/0 dark:from-white/10 dark:to-white/0 rounded-3xl pointer-events-none" />

              <div className="relative p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Upload Files</h2>
                    <p className="text-sm text-muted-foreground">PDF, EPUB, DOCX, TXT</p>
                  </div>
                </div>

                <LargeFileUploader
                  onComplete={handleUploadComplete}
                  onError={handleUploadError}
                  config={{
                    partSize: 10 * 1024 * 1024,
                    concurrency: 4,
                    maxRetries: 5,
                    mode: "direct",
                  }}
                  acceptedTypes={[".pdf", ".epub", ".txt", ".doc", ".docx", ".mobi"]}
                />
              </div>
            </div>

            {/* Success Message */}
            {uploadSuccess && (
              <div className="rounded-2xl border border-green-200/50 bg-green-50/60 dark:bg-green-950/20 backdrop-blur-md p-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-green-900 dark:text-green-100 text-lg">Upload Successful</h3>
                    <p className="text-green-700 dark:text-green-300 leading-relaxed">
                      Your file is being processed. You'll be redirected to your library momentarily.
                    </p>
                    <p className="text-xs font-mono text-green-600/80 dark:text-green-400/80 break-all pt-2">
                      {uploadedFileUrl}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-8">
            {/* Divider for Mobile */}
            <div className="lg:hidden relative py-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-muted/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest font-medium text-muted-foreground/70">
                <span className="bg-background/80 px-4 backdrop-blur-sm">Or Import Link</span>
              </div>
            </div>

            {/* Glass Card for URL Import */}
            <div className={`relative rounded-3xl border transition-all duration-300 backdrop-blur-xl ${isUrlInputFocused
              ? "border-primary/50 bg-white/60 dark:bg-black/30 shadow-[0_0_30px_-5px_var(--color-primary)] ring-1 ring-primary/20"
              : "border-white/20 bg-white/40 dark:bg-black/20 shadow-xl"
              }`}>
              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <LinkIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Web Import</h2>
                    <p className="text-sm text-muted-foreground">Articles, Blog posts</p>
                  </div>
                </div>

                <form onSubmit={handleUrlSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="url" className="text-sm font-medium text-foreground/80 ml-1">
                      URL
                    </label>
                    <div className="relative group">
                      <Input
                        id="url"
                        placeholder="https://medium.com/..."
                        className="h-12 pl-4 pr-12 rounded-xl border-muted bg-white/50 dark:bg-black/20 transition-all focus:bg-white dark:focus:bg-black/40"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onFocus={() => setIsUrlInputFocused(true)}
                        onBlur={() => setIsUrlInputFocused(false)}
                      />
                      <div className="absolute right-2 top-2">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/50">
                          <LinkIcon className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-12 rounded-xl text-base font-medium shadow-lg hover:shadow-primary/25 transition-all">
                    Import Content <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </div>
            </div>

            {/* Helper Info */}
            <div className="rounded-2xl bg-secondary/30 border border-white/10 p-6 backdrop-blur-sm">
              <h4 className="font-semibold mb-2 text-sm uppercase tracking-wider text-muted-foreground">Supported Sources</h4>
              <ul className="space-y-2 text-sm text-foreground/80">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> General Webpages & Blogs
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> arXiv Papers
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Substack Newsletters
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
