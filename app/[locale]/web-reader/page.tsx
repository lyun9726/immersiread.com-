"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Globe, Loader2 } from "lucide-react"

export default function WebReaderPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [url, setUrl] = useState("")

  const handleSimulateExtract = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 2000)
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
          <Globe className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-4">Web Reader</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Paste any article URL to read it distraction-free with AI translation and text-to-speech.
        </p>
      </div>

      <Card className="mb-12 shadow-lg">
        <CardContent className="pt-6">
          <form onSubmit={handleSimulateExtract} className="flex gap-4 flex-col sm:flex-row">
            <Input
              placeholder="https://medium.com/..."
              className="h-12 text-lg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" size="lg" className="h-12 px-8" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {isLoading ? "Extracting..." : "Read Now"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="font-semibold text-lg">Preview Example</h2>
        <div className="aspect-video bg-muted rounded-xl border shadow-sm overflow-hidden relative">
          <img
            src="https://blob.v0.app/9f3a4491-8585-454a-87a0-642067c922df.png"
            alt="Web Reader Preview"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-6">
            <div className="text-white">
              <h3 className="text-xl font-bold">The Future of AI in Education</h3>
              <p className="opacity-90">Read time: 5 min • Extracted from TechCrunch</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
