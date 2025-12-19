/**
 * Server-side proxy for Web Reader
 * Fetches web page content and serves it without X-Frame-Options restrictions
 */

import { NextRequest, NextResponse } from 'next/server'

// SSRF Protection: Block private/local IPs
const BLOCKED_IP_RANGES = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^::ffff:127\./,
    /^fc00:/,
    /^fe80:/,
]

function isBlockedURL(url: string): boolean {
    try {
        const urlObj = new URL(url)
        if (urlObj.hostname === "localhost") return true
        for (const pattern of BLOCKED_IP_RANGES) {
            if (pattern.test(urlObj.hostname)) return true
        }
        return false
    } catch {
        return true
    }
}

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url')

    if (!url) {
        return new NextResponse('URL parameter is required', { status: 400 })
    }

    // SSRF Protection
    if (isBlockedURL(url)) {
        return new NextResponse('Access to private/local URLs is not allowed', { status: 403 })
    }

    try {
        // Fetch the target page
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
        })

        clearTimeout(timeout)

        if (!response.ok) {
            return new NextResponse(`Failed to fetch: ${response.statusText}`, { status: response.status })
        }

        const contentType = response.headers.get('content-type') || 'text/html'

        // Only proxy HTML content
        if (!contentType.includes('text/html')) {
            // For non-HTML (images, CSS, JS), redirect to original URL
            return NextResponse.redirect(url)
        }

        let html = await response.text()

        // Parse base URL for rewriting relative URLs
        const baseUrl = new URL(url)
        const baseHref = `${baseUrl.protocol}//${baseUrl.host}`

        // Inject <base> tag to fix relative URLs
        const baseTag = `<base href="${baseHref}/">`
        if (html.includes('<head>')) {
            html = html.replace('<head>', `<head>${baseTag}`)
        } else if (html.includes('<HEAD>')) {
            html = html.replace('<HEAD>', `<HEAD>${baseTag}`)
        } else {
            html = baseTag + html
        }

        // Optional: Inject a script to handle link clicks (open in new tab)
        const interceptScript = `
      <script>
        document.addEventListener('click', function(e) {
          const link = e.target.closest('a');
          if (link && link.href && !link.href.startsWith('javascript:')) {
            e.preventDefault();
            window.open(link.href, '_blank');
          }
        });
      </script>
    `
        html = html.replace('</body>', interceptScript + '</body>')

        // Return HTML without X-Frame-Options
        return new NextResponse(html, {
            status: 200,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                // Do NOT include X-Frame-Options or frame-ancestors CSP
                'Cache-Control': 'public, max-age=3600',
            },
        })

    } catch (error) {
        console.error('[Proxy] Error:', error)

        if ((error as Error).name === 'AbortError') {
            return new NextResponse('Request timeout', { status: 408 })
        }

        return new NextResponse('Failed to fetch page', { status: 500 })
    }
}
