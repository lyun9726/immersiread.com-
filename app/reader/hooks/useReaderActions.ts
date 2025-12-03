/**
 * Hook for Reader actions
 */

import { useReaderStore } from "../stores/readerStore"
import { useRouter } from "next/navigation"

export function useReaderActions() {
  const router = useRouter()
  const store = useReaderStore()

  const fetchPreview = async (url: string) => {
    try {
      const response = await fetch("/api/ingest/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          previewOnly: true,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to fetch preview")
      }

      const data = await response.json()
      store.loadPreview(data.blocks)

      return data
    } catch (error) {
      console.error("[useReaderActions] fetchPreview error:", error)
      throw error
    }
  }

  const importFromURL = async (url: string) => {
    try {
      const response = await fetch("/api/reader/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          source: "web",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to import URL")
      }

      const data = await response.json()
      store.importBook(data.bookId)

      // Navigate to reader page
      router.push(`/reader/${data.bookId}`)

      return data
    } catch (error) {
      console.error("[useReaderActions] importFromURL error:", error)
      throw error
    }
  }

  const loadBook = async (bookId: string) => {
    try {
      // In production, fetch book data from API
      // For now, using in-memory DB
      const response = await fetch(`/api/reader/book/${bookId}`)

      if (!response.ok) {
        throw new Error("Failed to load book")
      }

      const data = await response.json()
      store.setBlocks(data.blocks)
      store.importBook(bookId)

      return data
    } catch (error) {
      console.error("[useReaderActions] loadBook error:", error)
      throw error
    }
  }

  return {
    fetchPreview,
    importFromURL,
    loadBook,
  }
}
