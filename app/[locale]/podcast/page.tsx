"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Mic, Loader2, Play, Pause, Download, BookOpen, GraduationCap, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type PodcastStyle = "casual" | "academic" | "storytelling"
type JobStatus = "idle" | "pending" | "processing" | "completed" | "failed"

interface StyleOption {
    value: PodcastStyle
    label: string
    description: string
    icon: React.ReactNode
}

const STYLE_OPTIONS: StyleOption[] = [
    {
        value: "casual",
        label: "轻松闲聊",
        description: "像朋友聊天一样，轻松易懂",
        icon: <Sparkles className="h-5 w-5" />,
    },
    {
        value: "academic",
        label: "学术讨论",
        description: "深入分析，像教授讲课",
        icon: <GraduationCap className="h-5 w-5" />,
    },
    {
        value: "storytelling",
        label: "故事讲述",
        description: "生动叙事，引人入胜",
        icon: <BookOpen className="h-5 w-5" />,
    },
]

export default function PodcastPage() {
    const { toast } = useToast()
    const [text, setText] = useState("")
    const [style, setStyle] = useState<PodcastStyle>("casual")
    const [status, setStatus] = useState<JobStatus>("idle")
    const [jobId, setJobId] = useState<string | null>(null)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)

    const audioRef = useRef<HTMLAudioElement>(null)
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

    // Poll for job status
    const pollStatus = useCallback(async (id: string) => {
        try {
            const response = await fetch(`/api/podcast/status/${id}`)
            const data = await response.json()

            if (data.status === "completed") {
                setStatus("completed")
                setAudioUrl(data.audio_url)
                if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current)
                    pollIntervalRef.current = null
                }
                toast({
                    title: "播客生成完成",
                    description: "您可以开始收听了",
                })
            } else if (data.status === "failed") {
                setStatus("failed")
                setError(data.error || "生成失败")
                if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current)
                    pollIntervalRef.current = null
                }
                toast({
                    title: "生成失败",
                    description: data.error,
                    variant: "destructive",
                })
            } else {
                setStatus(data.status)
            }
        } catch (err) {
            console.error("Poll error:", err)
        }
    }, [toast])

    // Start generation
    const handleGenerate = useCallback(async () => {
        if (!text.trim() || text.trim().length < 100) {
            toast({
                title: "内容不足",
                description: "请输入至少 100 个字符的内容",
                variant: "destructive",
            })
            return
        }

        setStatus("pending")
        setError(null)
        setAudioUrl(null)

        try {
            const response = await fetch("/api/podcast/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: text.trim(),
                    style,
                    language: "en",
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || "生成请求失败")
            }

            setJobId(data.job_id)
            setStatus("processing")

            // Start polling
            pollIntervalRef.current = setInterval(() => {
                pollStatus(data.job_id)
            }, 3000)

            toast({
                title: "开始生成",
                description: "正在为您生成播客，请稍候...",
            })

        } catch (err) {
            setStatus("failed")
            setError((err as Error).message)
            toast({
                title: "生成失败",
                description: (err as Error).message,
                variant: "destructive",
            })
        }
    }, [text, style, toast, pollStatus])

    // Audio controls
    const togglePlayback = useCallback(() => {
        if (!audioRef.current) return

        if (isPlaying) {
            audioRef.current.pause()
        } else {
            audioRef.current.play()
        }
        setIsPlaying(!isPlaying)
    }, [isPlaying])

    const handleDownload = useCallback(() => {
        if (!audioUrl) return

        const link = document.createElement("a")
        link.href = audioUrl
        link.download = `podcast-${jobId || "audio"}.mp3`
        link.click()
    }, [audioUrl, jobId])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
            }
        }
    }, [])

    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            {/* Header */}
            <div className="text-center mb-12">
                <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
                    <Mic className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-4xl font-bold mb-4">AI 播客生成</h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    将任意文本内容转换为生动的双人对话播客，如同 NotebookLM
                </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
                {/* Input Section */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>内容输入</CardTitle>
                            <CardDescription>
                                粘贴文章、书籍章节或任何您想转换为播客的内容
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                placeholder="在这里粘贴您的内容...（至少 100 字符）"
                                className="min-h-[300px] resize-none"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                disabled={status === "pending" || status === "processing"}
                            />
                            <p className="text-sm text-muted-foreground mt-2">
                                {text.length} 字符
                            </p>
                        </CardContent>
                    </Card>

                    {/* Style Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle>播客风格</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <RadioGroup
                                value={style}
                                onValueChange={(v) => setStyle(v as PodcastStyle)}
                                className="grid gap-3"
                            >
                                {STYLE_OPTIONS.map((option) => (
                                    <Label
                                        key={option.value}
                                        htmlFor={option.value}
                                        className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${style === option.value
                                                ? "border-primary bg-primary/5"
                                                : "border-muted hover:border-primary/50"
                                            }`}
                                    >
                                        <RadioGroupItem value={option.value} id={option.value} />
                                        <div className="flex items-center gap-3 flex-1">
                                            <div className="text-primary">{option.icon}</div>
                                            <div>
                                                <div className="font-medium">{option.label}</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {option.description}
                                                </div>
                                            </div>
                                        </div>
                                    </Label>
                                ))}
                            </RadioGroup>
                        </CardContent>
                    </Card>

                    {/* Generate Button */}
                    <Button
                        size="lg"
                        className="w-full h-14 text-lg"
                        onClick={handleGenerate}
                        disabled={
                            !text.trim() ||
                            text.trim().length < 100 ||
                            status === "pending" ||
                            status === "processing"
                        }
                    >
                        {status === "pending" || status === "processing" ? (
                            <>
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                {status === "pending" ? "准备中..." : "生成中..."}
                            </>
                        ) : (
                            <>
                                <Mic className="h-5 w-5 mr-2" />
                                生成播客
                            </>
                        )}
                    </Button>
                </div>

                {/* Output Section */}
                <div className="space-y-6">
                    <Card className="min-h-[400px] flex flex-col">
                        <CardHeader>
                            <CardTitle>生成结果</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col justify-center">
                            {status === "idle" && (
                                <div className="text-center text-muted-foreground py-12">
                                    <Mic className="h-16 w-16 mx-auto mb-4 opacity-30" />
                                    <p>输入内容并选择风格后点击生成</p>
                                </div>
                            )}

                            {(status === "pending" || status === "processing") && (
                                <div className="text-center py-12">
                                    <Loader2 className="h-16 w-16 mx-auto mb-4 animate-spin text-primary" />
                                    <p className="text-lg font-medium mb-2">
                                        {status === "pending" ? "准备生成..." : "正在生成播客..."}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        这可能需要 1-3 分钟，请耐心等待
                                    </p>
                                </div>
                            )}

                            {status === "failed" && (
                                <div className="text-center py-12">
                                    <div className="h-16 w-16 mx-auto mb-4 bg-destructive/10 rounded-full flex items-center justify-center">
                                        <span className="text-3xl">😕</span>
                                    </div>
                                    <p className="text-lg font-medium text-destructive mb-2">生成失败</p>
                                    <p className="text-sm text-muted-foreground">{error}</p>
                                    <Button
                                        variant="outline"
                                        className="mt-4"
                                        onClick={() => setStatus("idle")}
                                    >
                                        重试
                                    </Button>
                                </div>
                            )}

                            {status === "completed" && audioUrl && (
                                <div className="space-y-6 py-6">
                                    <div className="text-center">
                                        <div className="h-20 w-20 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                                            <span className="text-4xl">🎧</span>
                                        </div>
                                        <p className="text-lg font-medium text-green-700 dark:text-green-400">
                                            播客已生成！
                                        </p>
                                    </div>

                                    {/* Audio Player */}
                                    <div className="bg-muted/50 rounded-xl p-6">
                                        <audio
                                            ref={audioRef}
                                            src={audioUrl}
                                            onEnded={() => setIsPlaying(false)}
                                            className="hidden"
                                        />

                                        <div className="flex items-center justify-center gap-4">
                                            <Button
                                                size="lg"
                                                variant={isPlaying ? "secondary" : "default"}
                                                className="h-14 w-14 rounded-full"
                                                onClick={togglePlayback}
                                            >
                                                {isPlaying ? (
                                                    <Pause className="h-6 w-6" />
                                                ) : (
                                                    <Play className="h-6 w-6 ml-1" />
                                                )}
                                            </Button>
                                        </div>

                                        <div className="flex justify-center mt-4">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleDownload}
                                            >
                                                <Download className="h-4 w-4 mr-2" />
                                                下载 MP3
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Info Card */}
                    <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50">
                        <CardContent className="pt-6">
                            <h4 className="font-medium mb-2">💡 提示</h4>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• 建议输入 500-5000 字符的内容效果最佳</li>
                                <li>• 英文内容生成效果更好</li>
                                <li>• 首次生成可能需要较长时间</li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
