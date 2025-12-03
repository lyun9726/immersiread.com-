"use client"

import { useState } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play, Square, MoreHorizontal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

interface VoiceCardProps {
  name: string
  lang: string
  gender: string
  previewUrl?: string
  isCloned?: boolean
}

// Sample text for voice preview based on language
const PREVIEW_TEXTS: Record<string, string> = {
  "en": "Hello, this is a preview of my voice. I can help you read your documents.",
  "zh": "你好,这是我的声音预览。我可以帮助你阅读文档。",
  "ja": "こんにちは、これは私の声のプレビューです。あなたのドキュメントを読むお手伝いができます。",
  "ko": "안녕하세요, 이것은 제 음성 미리보기입니다. 문서를 읽는 데 도움을 드릴 수 있습니다.",
  "es": "Hola, esta es una vista previa de mi voz. Puedo ayudarte a leer tus documentos.",
  "fr": "Bonjour, ceci est un aperçu de ma voix. Je peux vous aider à lire vos documents.",
  "de": "Hallo, dies ist eine Vorschau meiner Stimme. Ich kann Ihnen beim Lesen Ihrer Dokumente helfen.",
}

export function VoiceCard({ name, lang, gender, isCloned }: VoiceCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const { toast } = useToast()

  const handlePreview = () => {
    // Check browser support
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      toast({
        title: "Not Supported",
        description: "Your browser doesn't support text-to-speech.",
        variant: "destructive",
      })
      return
    }

    // If already playing, stop it
    if (isPlaying) {
      window.speechSynthesis.cancel()
      setIsPlaying(false)
      return
    }

    // Get preview text
    const text = PREVIEW_TEXTS[lang] || PREVIEW_TEXTS["en"]

    // Create utterance
    const utterance = new SpeechSynthesisUtterance(text)

    // Try to find matching voice by language and gender
    const voices = window.speechSynthesis.getVoices()
    const matchingVoice = voices.find(voice => {
      const langMatch = voice.lang.toLowerCase().startsWith(lang.toLowerCase())
      const genderMatch = voice.name.toLowerCase().includes(gender.toLowerCase())
      return langMatch && genderMatch
    })

    // If no exact match, try just language
    if (!matchingVoice) {
      const langVoice = voices.find(voice =>
        voice.lang.toLowerCase().startsWith(lang.toLowerCase())
      )
      if (langVoice) {
        utterance.voice = langVoice
      }
    } else {
      utterance.voice = matchingVoice
    }

    // Set rate and pitch
    utterance.rate = 1.0
    utterance.pitch = 1.0

    // Handle events
    utterance.onstart = () => {
      setIsPlaying(true)
    }

    utterance.onend = () => {
      setIsPlaying(false)
    }

    utterance.onerror = (event) => {
      setIsPlaying(false)
      toast({
        title: "Playback Error",
        description: `Failed to play voice preview: ${event.error}`,
        variant: "destructive",
      })
    }

    // Speak
    window.speechSynthesis.speak(utterance)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
            {name[0]}
          </div>
          {isCloned && <Badge variant="secondary">Cloned</Badge>}
        </div>
        <h3 className="font-semibold text-lg">{name}</h3>
        <p className="text-sm text-muted-foreground capitalize">
          {lang} • {gender}
        </p>
      </CardContent>
      <CardFooter className="flex justify-between border-t p-4 bg-muted/20">
        <Button
          size="sm"
          variant="ghost"
          className="gap-2"
          onClick={handlePreview}
          disabled={isPlaying}
        >
          {isPlaying ? (
            <>
              <Square className="h-4 w-4" /> Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Preview
            </>
          )}
        </Button>
        <Button size="icon" variant="ghost">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}
