import { db } from "@/lib/storage/database"
import { LibraryClient } from "@/components/library/library-client"
// import type { Metadata } from "next"

export const dynamic = 'force-dynamic'

// export const metadata: Metadata = {
//   title: "My Library | OmniRead",
//   description: "Manage your book collection",
// }

export default async function LibraryPage() {
  // Fetch data directly on the server
  console.time("[LibraryPage] fetch books")
  const allBooks = await db.getAllBooks()
  console.timeEnd("[LibraryPage] fetch books")
  console.log(`[LibraryPage] Loaded ${allBooks.length} books`)

  // Strip heavy fields to reduce HTML size (Hydration data)
  const books = allBooks.map(book => {
    // Create a shallow copy to avoid mutating
    // blocks, chapters are heavy and not needed for list view
    const { blocks, ...rest } = book
    return rest
  })

  return <LibraryClient initialBooks={books} />
}
