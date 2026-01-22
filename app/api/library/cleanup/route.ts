/**
 * POST /api/library/cleanup - Clean up orphaned books (without userId)
 * 
 * This is a one-time cleanup API to remove legacy books that were created
 * before the user data isolation feature was implemented.
 * 
 * IMPORTANT: This should only be run by an admin user once.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/storage/database"

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        // Optional: Add admin check here
        // For now, just log the action

        const allBooks = await db.getAllBooks()
        const orphanedBooks = allBooks.filter(book => !book.userId)

        console.log(`[Cleanup] Found ${orphanedBooks.length} orphaned books (without userId)`)

        let deletedCount = 0
        for (const book of orphanedBooks) {
            try {
                await db.deleteBook(book.id)
                deletedCount++
                console.log(`[Cleanup] Deleted orphaned book: ${book.id} - ${book.title}`)
            } catch (err) {
                console.error(`[Cleanup] Failed to delete book ${book.id}:`, err)
            }
        }

        return NextResponse.json({
            success: true,
            found: orphanedBooks.length,
            deleted: deletedCount,
            message: `Cleaned up ${deletedCount} orphaned books`
        })
    } catch (error) {
        console.error("[Cleanup] Error:", error)
        return NextResponse.json(
            { error: "Failed to cleanup" },
            { status: 500 }
        )
    }
}

// GET method to preview what would be cleaned up
export async function GET(request: NextRequest) {
    try {
        const allBooks = await db.getAllBooks()
        const orphanedBooks = allBooks.filter(book => !book.userId)

        return NextResponse.json({
            total: allBooks.length,
            orphaned: orphanedBooks.length,
            preview: orphanedBooks.map(b => ({
                id: b.id,
                title: b.title,
                createdAt: b.createdAt
            }))
        })
    } catch (error) {
        console.error("[Cleanup] Error:", error)
        return NextResponse.json(
            { error: "Failed to get cleanup preview" },
            { status: 500 }
        )
    }
}
