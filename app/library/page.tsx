"use client"

import { useState, useEffect } from "react"
import { mockBooks } from "@/data/languages"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Filter, MoreVertical, Play, BookOpen, Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import type { Book } from "@/lib/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadBooks()
  }, [])

  const loadBooks = async () => {
    try {
      const response = await fetch("/api/library/books")
      if (!response.ok) {
        throw new Error("Failed to fetch books")
      }
      const data = await response.json()

      // Only show books from database (not mock books)
      setBooks(data.books)
    } catch (err) {
      console.error("Failed to load books:", err)
      setError((err as Error).message)
      // If API fails, show empty library
      setBooks([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteBook = async (book: Book) => {
    setBookToDelete(book)
  }

  const confirmDelete = async () => {
    if (!bookToDelete) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/library/books/${bookToDelete.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete book")
      }

      // Remove book from state
      setBooks(books.filter((b) => b.id !== bookToDelete.id))

      toast({
        title: "Book deleted",
        description: `"${bookToDelete.title}" has been removed from your library.`,
      })
    } catch (err) {
      console.error("Failed to delete book:", err)
      toast({
        title: "Error",
        description: "Failed to delete book. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setBookToDelete(null)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">My Library</h1>
          <p className="text-sm text-muted-foreground mt-1">{books.length} books</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search books..." className="pl-9" />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-lg">
          <p className="text-sm">Unable to load uploaded books. Showing sample library.</p>
        </div>
      )}

      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No books yet</h3>
          <p className="text-muted-foreground mb-6">Upload a book to get started with your reading journey</p>
          <Link href="/upload">
            <Button>Upload Book</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {books.map((book) => {
            const displayTitle = book.title || book.metadata?.title || "Untitled"
            const displayAuthor = book.author || book.metadata?.author || "Unknown Author"
            const displayCover = book.cover || book.metadata?.coverImage || null

            return (
              <Card key={book.id} className="group overflow-hidden flex flex-col h-full hover:shadow-md transition-shadow">
                <div className="aspect-[2/3] bg-muted relative overflow-hidden">
                  {displayCover ? (
                    <img
                      src={displayCover}
                      alt={displayTitle}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.style.display = "none"
                        e.currentTarget.nextElementSibling?.classList.remove("hidden")
                      }}
                    />
                  ) : null}
                  <div className={`${displayCover ? "hidden" : ""} absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center`}>
                    <BookOpen className="h-16 w-16 text-muted-foreground/30" />
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                    <Link href={`/reader/${book.id}`} className="w-full">
                      <Button size="sm" className="w-full gap-2" variant="secondary">
                        <BookOpen className="h-4 w-4" /> Read
                      </Button>
                    </Link>
                    <Button size="sm" className="w-full gap-2" variant="secondary">
                      <Play className="h-4 w-4" /> Listen
                    </Button>
                  </div>
                </div>
                <CardContent className="p-4 flex-1">
                  <h3 className="font-semibold line-clamp-2 mb-1" title={displayTitle}>
                    {displayTitle}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-1">{displayAuthor}</p>
                </CardContent>
                <CardFooter className="p-4 pt-0 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {book.createdAt
                      ? new Date(book.createdAt).toLocaleDateString()
                      : "Recently added"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDeleteBook(book)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!bookToDelete} onOpenChange={() => setBookToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Book</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{bookToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
