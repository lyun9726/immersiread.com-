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

  // Store state - Using new 3-layer architecture
  const blocks = useReaderStore((state) => state.blocks)
  const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)
  const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
  const setCurrentBlockIndex = useReaderStore((state) => state.setCurrentBlockIndex)
  const readingMode = useReaderStore((state) => state.readingMode)
  const setReadingMode = useReaderStore((state) => state.setReadingMode)
  const enhanceWithTranslation = useReaderStore((state) => state.enhanceWithTranslation)
  const setBlocks = useReaderStore((state) => state.setBlocks)

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
      await enhanceWithTranslation("zh")
      setReadingMode("bilingual")
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

              {enhancedBlocks.length > 0 && (
                <div className="mt-4 p-4 bg-secondary/50 rounded-lg">
                  <p className="text-sm font-medium mb-2">
                    Preview: {enhancedBlocks.length} blocks loaded
                  </p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {enhancedBlocks.map((block, idx) => (
                      <div
                        key={block.id}
                        className="p-2 bg-background rounded text-sm"
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          [{idx + 1}]
                        </span>{" "}
                        {block.original}
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
              {enhancedBlocks.length === 0 ? (
                <p className="text-muted-foreground">
                  No blocks loaded. Please ingest a URL first.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {enhancedBlocks.length} blocks • Currently reading: {currentBlockIndex + 1}
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
                        onClick={() => setReadingMode(readingMode === "original" ? "bilingual" : "original")}
                        variant={readingMode !== "original" ? "default" : "outline"}
                        size="sm"
                      >
                        {readingMode !== "original" ? "Hide" : "Show"} Translation
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {enhancedBlocks.map((block, idx) => (
                      <div
                        key={block.id}
                        onClick={() => setCurrentBlockIndex(idx)}
                        className={`p-4 rounded-lg cursor-pointer transition-colors ${
                          idx === currentBlockIndex
                            ? "bg-primary/10 border-2 border-primary"
                            : "bg-secondary/30 hover:bg-secondary/50"
                        }`}
                      >
                        <p className="text-sm font-medium mb-1">
                          <span className="font-mono text-xs text-muted-foreground">
                            [{idx + 1}]
                          </span>{" "}
                          {block.original}
                        </p>
                        {(readingMode === "bilingual" || readingMode === "translation") && block.translation && (
                          <p className="text-sm text-muted-foreground mt-2 pl-4 border-l-2 border-muted">
                            {block.translation}
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
              {enhancedBlocks.length === 0 ? (
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
                      Currently playing: Block {currentBlockIndex + 1} of {enhancedBlocks.length}
                    </p>
                    {enhancedBlocks[currentBlockIndex] && (
                      <p className="text-sm">{enhancedBlocks[currentBlockIndex].original}</p>
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
                if (blocks.length > 0) {
                  await enhanceWithTranslation("zh")
                  setReadingMode("bilingual")
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
