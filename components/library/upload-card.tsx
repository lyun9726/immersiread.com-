"use client"

import { useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Upload, X, Loader2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { LargeFileUploader } from "@/components/upload/large-file-uploader"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

interface UploadCardProps {
    onUploadComplete?: () => void
}

/**
 * Special card that appears as the first item in the library grid.
 * Clicking opens a dialog with the file uploader.
 */
export function UploadCard({ onUploadComplete }: UploadCardProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const router = useRouter()
    const { toast } = useToast()

    const handleUploadComplete = useCallback(async (
        fileUrl: string,
        key: string,
        originalFilename: string,
        coverImage?: string,
        author?: string,
        title?: string
    ) => {
        console.log("Upload complete!", { fileUrl, key, originalFilename, hasCover: !!coverImage, author, title })

        // Create book record
        try {
            const response = await fetch("/api/library/books", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileUrl,
                    originalFilename,
                    coverImage,
                    author,
                    title: title || undefined
                }),
            })

            if (response.ok) {
                const data = await response.json()
                console.log("Book created:", data.bookId)

                toast({
                    title: "上传成功",
                    description: `《${title || originalFilename}》已添加到书库`,
                })

                // Close dialog and refresh
                setIsOpen(false)
                onUploadComplete?.()
            } else {
                console.error("Failed to create book:", await response.text())
                toast({
                    title: "创建失败",
                    description: "文件已上传，但创建书籍记录失败",
                    variant: "destructive",
                })
            }
        } catch (error) {
            console.error("Failed to create book:", error)
            toast({
                title: "创建失败",
                description: "请稍后重试",
                variant: "destructive",
            })
        }
    }, [onUploadComplete, toast])

    const handleUploadError = useCallback((error: Error) => {
        console.error("Upload error:", error)
        toast({
            title: "上传失败",
            description: error.message,
            variant: "destructive",
        })
    }, [toast])

    return (
        <>
            <Card
                className="group overflow-hidden flex flex-col h-full cursor-pointer border-dashed border-2 border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5 transition-all"
                onClick={() => setIsOpen(true)}
            >
                <div className="aspect-[2/3] bg-muted/30 relative overflow-hidden flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground group-hover:text-primary transition-colors">
                        <div className="w-16 h-16 rounded-full bg-muted/50 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                            <Plus className="h-8 w-8" />
                        </div>
                    </div>
                </div>
                <div className="p-4 flex-1 flex flex-col items-center justify-center">
                    <h3 className="font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                        上传新书
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                        PDF, EPUB, DOCX
                    </p>
                </div>
            </Card>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5" />
                            上传新书
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-4">
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
                </DialogContent>
            </Dialog>
        </>
    )
}
