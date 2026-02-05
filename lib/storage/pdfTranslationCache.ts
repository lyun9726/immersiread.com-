/**
 * PDF Translation Cache Manager
 * Handles caching of translated PDF pages in IndexedDB for offline access
 */

const DB_NAME = 'pdf-translation-cache';
const DB_VERSION = 1;
const STORE_NAME = 'translated-pages';

interface TranslatedPageEntry {
    key: string;  // Format: `${bookId}_page_${pageNumber}_${targetLang}`
    bookId: string;
    pageNumber: number;
    targetLang: string;
    translatedPageUrl: string;
    cachedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error('IndexedDB not available'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                store.createIndex('bookId', 'bookId', { unique: false });
                store.createIndex('cachedAt', 'cachedAt', { unique: false });
            }
        };
    });

    return dbPromise;
}

/**
 * Get cached translation for a specific page
 */
export async function getCachedTranslation(
    bookId: string,
    pageNumber: number,
    targetLang: string
): Promise<TranslatedPageEntry | null> {
    try {
        const db = await getDB();
        const key = `${bookId}_page_${pageNumber}_${targetLang}`;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || null);
        });
    } catch (error) {
        console.error('[PDFCache] Failed to get cached translation:', error);
        return null;
    }
}

/**
 * Cache a translated page
 */
export async function cacheTranslation(
    bookId: string,
    pageNumber: number,
    targetLang: string,
    translatedPageUrl: string
): Promise<void> {
    try {
        const db = await getDB();
        const key = `${bookId}_page_${pageNumber}_${targetLang}`;

        const entry: TranslatedPageEntry = {
            key,
            bookId,
            pageNumber,
            targetLang,
            translatedPageUrl,
            cachedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(entry);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                console.log(`[PDFCache] Cached page ${pageNumber} for book ${bookId}`);
                resolve();
            };
        });
    } catch (error) {
        console.error('[PDFCache] Failed to cache translation:', error);
    }
}

/**
 * Clear all cached translations for a book
 */
export async function clearBookCache(bookId: string): Promise<void> {
    try {
        const db = await getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('bookId');
            const request = index.openCursor(IDBKeyRange.only(bookId));

            request.onerror = () => reject(request.error);
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    console.log(`[PDFCache] Cleared cache for book ${bookId}`);
                    resolve();
                }
            };
        });
    } catch (error) {
        console.error('[PDFCache] Failed to clear book cache:', error);
    }
}

/**
 * Get all cached pages for a book
 */
export async function getBookCachedPages(
    bookId: string,
    targetLang: string
): Promise<Map<number, string>> {
    try {
        const db = await getDB();
        const result = new Map<number, string>();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('bookId');
            const request = index.openCursor(IDBKeyRange.only(bookId));

            request.onerror = () => reject(request.error);
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    const entry = cursor.value as TranslatedPageEntry;
                    if (entry.targetLang === targetLang) {
                        result.set(entry.pageNumber, entry.translatedPageUrl);
                    }
                    cursor.continue();
                } else {
                    resolve(result);
                }
            };
        });
    } catch (error) {
        console.error('[PDFCache] Failed to get book cached pages:', error);
        return new Map();
    }
}

/**
 * Request translation for a page (with caching)
 */
export async function requestPageTranslation(
    bookId: string,
    pageNumber: number,
    targetLang: string = 'zh',
    pdfUrl?: string
): Promise<{ url: string | null; cached: boolean; status: 'completed' | 'processing' | 'failed' }> {
    // 1. Check local cache first
    const cached = await getCachedTranslation(bookId, pageNumber, targetLang);
    if (cached) {
        console.log(`[PDFCache] Using cached translation for page ${pageNumber}`);
        return { url: cached.translatedPageUrl, cached: true, status: 'completed' };
    }

    // 2. Request translation from backend
    try {
        console.log(`[PDFCache] Requesting translation for page ${pageNumber}...`);

        const response = await fetch('/api/translate/pdf/page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookId, pageNumber, targetLang, pdfUrl })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[PDFCache] Translation request failed:', error);
            return { url: null, cached: false, status: 'failed' };
        }

        const result = await response.json();

        // If already completed (cached on server), save to local cache
        if (result.status === 'completed' && result.translatedPageUrl) {
            await cacheTranslation(bookId, pageNumber, targetLang, result.translatedPageUrl);
            return { url: result.translatedPageUrl, cached: result.cached || false, status: 'completed' };
        }

        // If processing, return processing status
        if (result.status === 'processing') {
            return { url: null, cached: false, status: 'processing' };
        }

        return { url: null, cached: false, status: 'failed' };
    } catch (error) {
        console.error('[PDFCache] Translation request error:', error);
        return { url: null, cached: false, status: 'failed' };
    }
}

/**
 * Prefetch translations for upcoming pages (background)
 */
export async function prefetchTranslations(
    bookId: string,
    currentPage: number,
    totalPages: number,
    targetLang: string = 'zh',
    prefetchCount: number = 2,
    pdfUrl?: string
): Promise<void> {
    // Prefetch next N pages
    for (let i = 1; i <= prefetchCount; i++) {
        const nextPage = currentPage + i;
        if (nextPage <= totalPages) {
            // Check if already cached
            const cached = await getCachedTranslation(bookId, nextPage, targetLang);
            if (!cached) {
                // Fire and forget - don't await
                requestPageTranslation(bookId, nextPage, targetLang, pdfUrl).catch(() => { });
            }
        }
    }
}
