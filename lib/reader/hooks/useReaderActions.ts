/**
 * Hook for Reader actions
 * Updated for 3-layer architecture
 */

import { useReaderStore } from "../stores/readerStore"
import { useRouter } from "next/navigation"

export function useReaderActions() {
    const router = useRouter()
    const setBlocks = useReaderStore((state) => state.setBlocks)
    const loadBook = useReaderStore((state) => state.loadBook)

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

            // Convert blocks to new format if needed
            const blocks = data.blocks.map((b: any) => ({
                id: b.id,
                order: b.order,
                type: b.type || "text",
                content: b.content || b.text || "",
                meta: b.meta,
            }))

            setBlocks(blocks, data.chapters || [])

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

            // Navigate to reader page
            router.push(`/reader/${data.bookId}`)

            return data
        } catch (error) {
            console.error("[useReaderActions] importFromURL error:", error)
            throw error
        }
    }

    return {
        fetchPreview,
        importFromURL,
        loadBook, // Directly use store's loadBook method
    }
}
