"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Filter, BookOpen, Loader2, Trash2, CheckSquare, X } from "lucide-react"
import Link from "next/link"
import type { Book } from "@/lib/types"
import { UploadCard } from "@/components/library/upload-card"
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
import { useToast } from "@/hooks/use-toast"
import { useTranslations } from 'next-intl'

export default function LibraryPage() {
  const t = useTranslations('Library')
  const [books, setBooks] = useState<Book[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  // Batch delete state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false)
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
        title: t('bookDeleted'),
        description: t('bookDeletedDesc', { title: bookToDelete.title }),
      })
    } catch (err) {
      console.error("Failed to delete book:", err)
      toast({
        title: t('error'),
        description: t('deleteError'),
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setBookToDelete(null)
    }
  }

  // Toggle book selection
  const toggleSelect = (bookId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(bookId)) {
        next.delete(bookId)
      } else {
        next.add(bookId)
      }
      return next
    })
  }

  // Select/deselect all
  const toggleSelectAll = () => {
    if (selectedIds.size === books.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(books.map(b => b.id)))
    }
  }

  // Exit select mode
  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  // Batch delete
  const confirmBatchDelete = async () => {
    if (selectedIds.size === 0) return

    setIsDeleting(true)
    const toDelete = Array.from(selectedIds)
    let successCount = 0

    for (const bookId of toDelete) {
      try {
        const response = await fetch(`/api/library/books/${bookId}`, {
          method: "DELETE",
        })
        if (response.ok) {
          successCount++
        }
      } catch (err) {
        console.error(`Failed to delete book ${bookId}:`, err)
      }
    }

    // Update state
    setBooks(books.filter(b => !selectedIds.has(b.id)))
    setSelectedIds(new Set())
    setShowBatchDeleteDialog(false)
    setSelectMode(false)
    setIsDeleting(false)

    toast({
      title: t('booksDeleted'),
      description: t('batchDeleteSuccess', { success: successCount, total: toDelete.length }),
    })
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
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('bookCount', { count: books.length })}</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {/* Select Mode Toggle / Batch Delete Bar */}
          {selectMode ? (
            <>
              <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                <CheckSquare className="h-4 w-4 mr-2" />
                {selectedIds.size === books.length ? t('deselectAll') : t('selectAll')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setShowBatchDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('deleteCount', { count: selectedIds.size })}
              </Button>
              <Button variant="ghost" size="icon" onClick={exitSelectMode}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('searchPlaceholder')} className="pl-9" />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
              {books.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                  <CheckSquare className="h-4 w-4 mr-2" />
                  {t('select')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-lg">
          <p className="text-sm">{t('loadError')}</p>
        </div>
      )}

      {books.length === 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          <UploadCard onUploadComplete={loadBooks} />
          {/* Empty state message */}
          <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('emptyTitle')}</h3>
            <p className="text-muted-foreground text-sm">{t('emptySubtitle')}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          {/* Upload Card - Always First */}
          {!selectMode && <UploadCard onUploadComplete={loadBooks} />}
          {books.map((book) => {
            const displayTitle = book.title || book.metadata?.title || "Untitled"
            const displayCover = book.cover || book.metadata?.coverImage || null
            const isSelected = selectedIds.has(book.id)

            return (
              <div
                key={book.id}
                className="relative overflow-hidden rounded-lg"
              >
                {/* Delete button - hidden behind card, revealed on swipe */}
                <div
                  className="absolute inset-y-0 right-0 w-14 bg-destructive flex items-center justify-center md:hidden"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteBook(book)
                  }}
                >
                  <Trash2 className="h-5 w-5 text-white" />
                </div>

                {/* Swipeable Card Container - full width background to cover delete button */}
                <div
                  className="relative transition-transform touch-pan-y bg-background"
                  style={{ transform: 'translateX(0)' }}
                  onTouchStart={(e) => {
                    const touch = e.touches[0]
                    const target = e.currentTarget
                    target.dataset.startX = touch.clientX.toString()
                    target.dataset.startY = touch.clientY.toString()
                  }}
                  onTouchMove={(e) => {
                    const target = e.currentTarget
                    const startX = parseFloat(target.dataset.startX || '0')
                    const startY = parseFloat(target.dataset.startY || '0')
                    const touch = e.touches[0]
                    const deltaX = touch.clientX - startX
                    const deltaY = touch.clientY - startY

                    // Only handle horizontal swipes
                    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < 0) {
                      const translateX = Math.max(deltaX, -56) // max 56px (w-14)
                      target.style.transform = `translateX(${translateX}px)`
                    }
                  }}
                  onTouchEnd={(e) => {
                    const target = e.currentTarget
                    const startX = parseFloat(target.dataset.startX || '0')
                    const touch = e.changedTouches[0]
                    const deltaX = touch.clientX - startX

                    // If swiped more than 30px, snap to show delete button
                    if (deltaX < -30) {
                      target.style.transform = 'translateX(-56px)'
                    } else {
                      target.style.transform = 'translateX(0)'
                    }
                  }}
                  onClick={() => {
                    // Reset any open swipe when clicking
                    const allSwipeable = document.querySelectorAll('[data-start-x]') as NodeListOf<HTMLElement>
                    allSwipeable.forEach(el => {
                      if (el.style.transform.includes('-56px')) {
                        el.style.transform = 'translateX(0)'
                      }
                    })
                  }}
                >
                  <Link href={selectMode ? '#' : `/reader/${book.id}`}>
                    <Card
                      className={`overflow-hidden flex flex-col transition-all ${selectMode ? 'cursor-pointer' : ''
                        } ${isSelected ? 'ring-2 ring-primary shadow-lg' : ''}`}
                      onClick={selectMode ? (e) => { e.preventDefault(); toggleSelect(book.id) } : undefined}
                    >
                      <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                        {/* Checkbox in select mode */}
                        {selectMode && (
                          <div className="absolute top-1 left-1 z-20">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(book.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 bg-white/90 border-2"
                            />
                          </div>
                        )}
                        {/* Format Badge */}
                        <div className="absolute top-1 right-1 z-20">
                          <Badge variant="secondary" className="uppercase text-[7px] md:text-[10px] h-3.5 md:h-5 px-1 bg-background/80 backdrop-blur-sm shadow-sm">
                            {book.format || (book.sourceUrl?.split('.').pop()?.slice(0, 4).toUpperCase()) || 'TXT'}
                          </Badge>
                        </div>
                        {/* Translation badge on cover */}
                        {book.isTranslation && (
                          <div className="absolute top-1 left-1 z-20">
                            <span className="inline-flex items-center px-1 rounded text-[8px] font-medium bg-blue-500 text-white shadow-sm">
                              译
                            </span>
                          </div>
                        )}
                        {displayCover ? (
                          <img
                            src={displayCover}
                            alt={displayTitle}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none"
                              e.currentTarget.nextElementSibling?.classList.remove("hidden")
                            }}
                          />
                        ) : null}
                        <div className={`${displayCover ? "hidden" : ""} absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center`}>
                          <BookOpen className="h-6 w-6 md:h-12 md:w-12 text-muted-foreground/30" />
                        </div>
                        {/* Progress Bar - show for all formats */}
                        {(typeof book.progressPercentage === 'number' && book.progressPercentage > 0) && (
                          <>
                            <div className="absolute bottom-1 right-1 z-10 px-0.5 py-0.5 rounded bg-black/60 text-white text-[8px] font-medium leading-none">
                              {book.progressPercentage}%
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${book.progressPercentage}%` }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      {/* Title area - fixed height */}
                      <div className="px-1.5 py-1.5 md:p-2 h-10 md:h-12 flex items-start">
                        <h3 className="font-medium text-[10px] md:text-xs line-clamp-2 leading-tight" title={displayTitle}>
                          {displayTitle}
                        </h3>
                      </div>
                    </Card>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )
      }

      <AlertDialog open={!!bookToDelete} onOpenChange={() => setBookToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDialogDesc', { title: bookToDelete?.title || '' })}
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
                  {t('deleting')}
                </>
              ) : (
                t('delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Delete Confirmation Dialog */}
      <AlertDialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('batchDeleteTitle', { count: selectedIds.size })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('batchDeleteDesc', { count: selectedIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBatchDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('deleting')}
                </>
              ) : (
                t('batchDeleteButton', { count: selectedIds.size })
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  )
}
