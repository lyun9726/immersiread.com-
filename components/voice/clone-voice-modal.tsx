"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Mic, Upload, Square, Loader2, CheckCircle2, X } from "lucide-react"
import { useState, useRef, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"

interface CloneModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CloneVoiceModal({ open, onOpenChange }: CloneModalProps) {
  const { toast } = useToast()
  const [voiceName, setVoiceName] = useState("")
  const [consent, setConsent] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioFileName, setAudioFileName] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setAudioFileName("recording.webm")
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error("Failed to start recording:", err)
      toast({
        title: "录音失败",
        description: "无法访问麦克风，请检查浏览器权限设置。",
        variant: "destructive",
      })
    }
  }, [toast])

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('audio/')) {
        toast({
          title: "文件类型错误",
          description: "请上传音频文件 (MP3, WAV, M4A 等)",
          variant: "destructive",
        })
        return
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "文件过大",
          description: "音频文件不能超过 10MB",
          variant: "destructive",
        })
        return
      }

      setAudioBlob(file)
      setAudioUrl(URL.createObjectURL(file))
      setAudioFileName(file.name)
    }
  }, [toast])

  // Clear audio
  const clearAudio = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioBlob(null)
    setAudioUrl(null)
    setAudioFileName(null)
  }, [audioUrl])

  // Create voice clone
  const handleCreateVoice = useCallback(async () => {
    if (!voiceName.trim()) {
      toast({
        title: "请输入语音名称",
        description: "语音名称不能为空",
        variant: "destructive",
      })
      return
    }

    if (!audioBlob) {
      toast({
        title: "请提供音频样本",
        description: "请录制或上传音频样本",
        variant: "destructive",
      })
      return
    }

    if (!consent) {
      toast({
        title: "请确认版权声明",
        description: "请勾选确认您有权使用此语音",
        variant: "destructive",
      })
      return
    }

    setIsCreating(true)

    try {
      // TODO: Implement actual API call to voice cloning service
      // For now, simulate a delay
      await new Promise(resolve => setTimeout(resolve, 2000))

      toast({
        title: "语音克隆成功",
        description: `"${voiceName}" 已创建完成`,
      })

      // Reset and close
      setVoiceName("")
      setConsent(false)
      clearAudio()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to create voice:", err)
      toast({
        title: "创建失败",
        description: "语音克隆过程中发生错误，请重试。",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }, [voiceName, audioBlob, consent, toast, clearAudio, onOpenChange])

  // Reset state when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Clean up on close
      if (isRecording) {
        stopRecording()
      }
      clearAudio()
      setVoiceName("")
      setConsent(false)
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>克隆新语音</DialogTitle>
          <DialogDescription>从音频样本创建自定义 AI 语音。</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">语音名称</label>
            <Input
              placeholder="例如：我的朗读声音"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
            />
          </div>

          {/* Audio input buttons or audio preview */}
          {!audioBlob ? (
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                className={`h-24 flex flex-col gap-2 border-dashed bg-transparent ${isRecording ? 'border-red-500 text-red-500' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? (
                  <>
                    <Square className="h-6 w-6 fill-current" />
                    停止录音
                  </>
                ) : (
                  <>
                    <Mic className="h-6 w-6" />
                    录音样本
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2 border-dashed bg-transparent"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRecording}
              >
                <Upload className="h-6 w-6" />
                上传音频
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          ) : (
            <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium">{audioFileName}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={clearAudio}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {audioUrl && (
                <audio controls className="w-full h-10" src={audioUrl} />
              )}
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-muted rounded-md text-sm text-muted-foreground">
            <Checkbox
              id="consent"
              className="mt-0.5"
              checked={consent}
              onCheckedChange={(checked) => setConsent(checked as boolean)}
            />
            <label htmlFor="consent" className="cursor-pointer">
              我确认拥有使用此语音的权利，并且不会侵犯任何版权或隐私法规。
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isCreating}>
            取消
          </Button>
          <Button onClick={handleCreateVoice} disabled={isCreating || !voiceName || !audioBlob || !consent}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                创建中...
              </>
            ) : (
              "创建语音"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
