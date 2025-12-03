"use client"

/**
 * Reader Demo Page
 * Demonstrates all Reader core functionality:
 * - URL ingestion and preview
 * - Book import
 * - Translation
 * - TTS playback
 */

import { useState } from "react"
import { useReaderStore } from "@/app/reader/stores/readerStore"
import { useReaderActions } from "@/app/reader/hooks/useReaderActions"
import { useTTS } from "@/app/reader/hooks/useTTS"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function ReaderDemoPage() {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Store state
  const blocks = useReaderStore((state) => state.blocks)
  const currentIndex = useReaderStore((state) => state.currentIndex)
  const setCurrentIndex = useReaderStore((state) => state.setCurrentIndex)
  const translationEnabled = useReaderStore((state) => state.translation.enabled)
  const translatedMap = useReaderStore((state) => state.translation.translatedMap)
  const translateBlocks = useReaderStore((state) => state.translateBlocks)
  const setTranslationEnabled = useReaderStore((state) => state.setTranslationEnabled)

  // Actions
  const { fetchPreview, importFromURL } = useReaderActions()
  const { play, pause, stop, setRate, isPlaying, rate } = useTTS()

  // Demo URL
  const demoURL = "file:///mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png"

  const handlePreview = async () => {
    setLoading(true)
    setError("")
    try {
      await fetchPreview(url || demoURL)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    setLoading(true)
    setError("")
    try {
      await importFromURL(url || demoURL)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleTranslate = async () => {
    setLoading(true)
    setError("")
    try {
      const items = blocks.map((b) => ({ id: b.id, text: b.text }))
      await translateBlocks(items, "zh")
      setTranslationEnabled(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Reader Demo</h1>
        <p className="text-muted-foreground">
          Test all Reader core functionality: URL ingestion, translation, and TTS
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      <Tabs defaultValue="ingest" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ingest">1. Ingest URL</TabsTrigger>
          <TabsTrigger value="read">2. Read & Translate</TabsTrigger>
          <TabsTrigger value="tts">3. TTS Playback</TabsTrigger>
        </TabsList>

        {/* Tab 1: URL Ingestion */}
        <TabsContent value="ingest">
          <Card>
            <CardHeader>
              <CardTitle>URL Ingestion & Preview</CardTitle>
              <CardDescription>
                Fetch and preview content from a URL before importing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">URL to fetch:</label>
                <Input
                  placeholder="Enter URL or leave empty for demo"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use demo URL: {demoURL}
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={handlePreview} disabled={loading}>
                  {loading ? "Loading..." : "Preview"}
                </Button>
                <Button onClick={handleImport} disabled={loading} variant="secondary">
                  {loading ? "Importing..." : "Import as Book"}
                </Button>
              </div>

              {blocks.length > 0 && (
                <div className="mt-4 p-4 bg-secondary/50 rounded-lg">
                  <p className="text-sm font-medium mb-2">
                    Preview: {blocks.length} blocks loaded
                  </p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {blocks.map((block, idx) => (
                      <div
                        key={block.id}
                        className="p-2 bg-background rounded text-sm"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          [{block.order}]
                        </span>{" "}
                        {block.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Reading & Translation */}
        <TabsContent value="read">
          <Card>
            <CardHeader>
              <CardTitle>Reading & Translation</CardTitle>
              <CardDescription>
                View blocks and translate them to different languages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {blocks.length === 0 ? (
                <p className="text-muted-foreground">
                  No blocks loaded. Please ingest a URL first.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {blocks.length} blocks • Currently reading: {currentIndex + 1}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Click on any block to navigate
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleTranslate}
                        disabled={loading}
                        variant="outline"
                        size="sm"
                      >
                        Translate All
                      </Button>
                      <Button
                        onClick={() => setTranslationEnabled(!translationEnabled)}
                        variant={translationEnabled ? "default" : "outline"}
                        size="sm"
                      >
                        {translationEnabled ? "Hide" : "Show"} Translation
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {blocks.map((block, idx) => (
                      <div
                        key={block.id}
                        onClick={() => setCurrentIndex(idx)}
                        className={`p-4 rounded-lg cursor-pointer transition-colors ${
                          idx === currentIndex
                            ? "bg-primary/10 border-2 border-primary"
                            : "bg-secondary/30 hover:bg-secondary/50"
                        }`}
                      >
                        <p className="text-sm font-medium mb-1">
                          <span className="font-mono text-xs text-muted-foreground">
                            [{block.order}]
                          </span>{" "}
                          {block.text}
                        </p>
                        {translationEnabled && translatedMap[block.id] && (
                          <p className="text-sm text-muted-foreground mt-2 pl-4 border-l-2 border-muted">
                            {translatedMap[block.id]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: TTS Playback */}
        <TabsContent value="tts">
          <Card>
            <CardHeader>
              <CardTitle>Text-to-Speech Playback</CardTitle>
              <CardDescription>
                Listen to the content with adjustable speed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {blocks.length === 0 ? (
                <p className="text-muted-foreground">
                  No blocks loaded. Please ingest a URL first.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {!isPlaying ? (
                      <Button onClick={play}>Play</Button>
                    ) : (
                      <Button onClick={pause} variant="secondary">
                        Pause
                      </Button>
                    )}
                    <Button onClick={stop} variant="outline">
                      Stop
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">
                        Playback Speed: {rate.toFixed(1)}x
                      </label>
                      <span className="text-xs text-muted-foreground">
                        0.5x - 2.0x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={rate}
                      onChange={(e) => setRate(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div className="p-4 bg-secondary/50 rounded-lg">
                    <p className="text-sm font-medium mb-2">
                      Currently playing: Block {currentIndex + 1} of {blocks.length}
                    </p>
                    {blocks[currentIndex] && (
                      <p className="text-sm">{blocks[currentIndex].text}</p>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      <strong>Note:</strong> This is a demo implementation using silent
                      audio.
                    </p>
                    <p>
                      To enable real TTS, integrate with ElevenLabs, Google Cloud TTS, or
                      Azure Cognitive Services.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Test Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Quick Test</CardTitle>
          <CardDescription>
            Test the complete flow with one click
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={async () => {
              setLoading(true)
              setError("")
              try {
                // 1. Fetch preview
                await fetchPreview(demoURL)
                // 2. Translate
                const items = blocks.map((b) => ({ id: b.id, text: b.text }))
                if (items.length > 0) {
                  await translateBlocks(items, "zh")
                  setTranslationEnabled(true)
                }
                // 3. Start TTS
                play()
              } catch (err) {
                setError((err as Error).message)
              } finally {
                setLoading(false)
              }
            }}
            disabled={loading}
            size="lg"
          >
            {loading ? "Running..." : "Run Complete Demo"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
