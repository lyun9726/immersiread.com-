"use client"

import type React from "react"

import { useState } from "react"
import { CheckCircle, UploadCloud } from "lucide-react"
import { LargeFileUploader } from "@/components/upload/large-file-uploader"
import { useRouter } from "next/navigation"

export default function UploadPage() {
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [uploadedFileUrl, setUploadedFileUrl] = useState("")
  const router = useRouter()

  const handleUploadComplete = async (fileUrl: string, key: string, originalFilename: string, coverImage?: string, author?: string, title?: string) => {
    console.log("Upload complete!", { fileUrl, key, originalFilename, hasCover: !!coverImage, author, title })
    setUploadSuccess(true)
    setUploadedFileUrl(fileUrl)

    // Create book record instantly (no parsing, just save URL)
    try {
      const response = await fetch("/api/library/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl,
          originalFilename,
          coverImage,
          author,
          title: title || undefined // Only pass if extracted
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log("Book created instantly:", data.bookId)
      } else {
        console.error("Failed to create book:", await response.text())
      }
    } catch (error) {
      console.error("Failed to create book:", error)
    }

    // Always navigate to library, even if API fails
    router.push("/library")
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

      <div className="container mx-auto px-6 py-16 max-w-3xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent">
            上传文件
          </h1>
          <p className="text-xl text-muted-foreground/80 max-w-2xl mx-auto">
            导入书籍、论文或文档，支持最大 10GB 文件，AI 智能处理。
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            如需导入网页文章，请使用 <a href="/web-reader" className="text-primary hover:underline">网页阅读器</a>
          </p>
        </div>

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
                  <h2 className="text-xl font-semibold">上传文件</h2>
                  <p className="text-sm text-muted-foreground">PDF, EPUB, DOCX, TXT, MOBI</p>
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
                  <h3 className="font-semibold text-green-900 dark:text-green-100 text-lg">上传成功</h3>
                  <p className="text-green-700 dark:text-green-300 leading-relaxed">
                    文件正在处理中，即将跳转到书库。
                  </p>
                  <p className="text-xs font-mono text-green-600/80 dark:text-green-400/80 break-all pt-2">
                    {uploadedFileUrl}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
