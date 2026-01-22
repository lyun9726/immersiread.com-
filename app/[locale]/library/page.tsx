import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/storage/database"
import { LibraryClient } from "@/components/library/library-client"

/**
 * Library Page with User Data Isolation
 * 
 * - Logged-in users: Fetch their books from cloud (filtered by userId)
 * - Guest users: Pass empty array, client will load from localStorage
 */
export default async function LibraryPage() {
  // Get user session
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  const isGuest = !userId

  let books: any[] = []

  if (userId) {
    // Logged-in user: fetch their books from cloud
    console.time("[LibraryPage] fetch books")
    const allBooks = await db.getAllBooks()
    books = allBooks.filter(book => book.userId === userId)
    console.timeEnd("[LibraryPage] fetch books")
    console.log(`[LibraryPage] Loaded ${books.length} books for user ${userId}`)
  } else {
    console.log("[LibraryPage] Guest user - books will load from localStorage")
  }

  // Strip heavy fields to reduce HTML size
  const strippedBooks = books.map(book => {
    const { blocks, ...rest } = book
    return rest
  })

  return (
    <LibraryClient
      initialBooks={strippedBooks}
      isGuest={isGuest}
      userId={userId}
    />
  )
}
