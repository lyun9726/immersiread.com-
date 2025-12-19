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

        // Inject comprehensive interaction scripts
        const interactionScript = `
      <style>
        .readai-highlight {
          background-color: rgba(255, 220, 100, 0.4) !important;
          outline: 2px solid rgba(255, 180, 0, 0.6) !important;
          border-radius: 4px !important;
          transition: background-color 0.3s, outline 0.3s !important;
        }
        .readai-paragraph {
          cursor: pointer !important;
          transition: background-color 0.2s !important;
        }
        .readai-paragraph:hover {
          background-color: rgba(100, 150, 255, 0.1) !important;
        }
        .readai-translation {
          display: block;
          margin-top: 8px;
          padding: 8px 12px;
          background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
          border-left: 3px solid #4285f4;
          border-radius: 4px;
          font-size: 0.9em;
          color: #333;
          line-height: 1.6;
        }
      </style>
      <script>
        (function() {
          // Mark all paragraphs for interaction
          const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption');
          let paragraphId = 0;
          
          textElements.forEach(el => {
            const text = el.innerText?.trim();
            if (text && text.length > 10) {
              el.classList.add('readai-paragraph');
              el.dataset.readaiId = 'p-' + (paragraphId++);
              el.dataset.readaiText = text;
            }
          });

          // Extract all paragraphs and send to parent
          function getAllParagraphs() {
            const paragraphs = [];
            document.querySelectorAll('.readai-paragraph').forEach(el => {
              paragraphs.push({
                id: el.dataset.readaiId,
                text: el.dataset.readaiText
              });
            });
            return paragraphs;
          }

          // Send paragraphs to parent on load
          window.parent.postMessage({
            type: 'READAI_PARAGRAPHS',
            paragraphs: getAllParagraphs()
          }, '*');

          // Handle click on paragraph
          document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link && link.href && !link.href.startsWith('javascript:')) {
              e.preventDefault();
              window.open(link.href, '_blank');
              return;
            }

            const paragraph = e.target.closest('.readai-paragraph');
            if (paragraph) {
              e.preventDefault();
              e.stopPropagation();
              window.parent.postMessage({
                type: 'READAI_PARAGRAPH_CLICK',
                paragraphId: paragraph.dataset.readaiId,
                text: paragraph.dataset.readaiText
              }, '*');
            }
          });

          // Listen for commands from parent
          window.addEventListener('message', function(e) {
            if (e.data.type === 'READAI_HIGHLIGHT') {
              // Remove previous highlight
              document.querySelectorAll('.readai-highlight').forEach(el => {
                el.classList.remove('readai-highlight');
              });
              // Add new highlight
              if (e.data.paragraphId) {
                const el = document.querySelector('[data-readai-id="' + e.data.paragraphId + '"]');
                if (el) {
                  el.classList.add('readai-highlight');
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }
            }

            if (e.data.type === 'READAI_SHOW_TRANSLATION') {
              const el = document.querySelector('[data-readai-id="' + e.data.paragraphId + '"]');
              if (el) {
                // Remove existing translation if any
                const existing = el.querySelector('.readai-translation');
                if (existing) existing.remove();
                
                // Add translation
                if (e.data.translation) {
                  const transDiv = document.createElement('div');
                  transDiv.className = 'readai-translation';
                  transDiv.textContent = e.data.translation;
                  el.appendChild(transDiv);
                }
              }
            }

            if (e.data.type === 'READAI_CLEAR_TRANSLATIONS') {
              document.querySelectorAll('.readai-translation').forEach(el => el.remove());
            }

            if (e.data.type === 'READAI_GET_PARAGRAPHS') {
              window.parent.postMessage({
                type: 'READAI_PARAGRAPHS',
                paragraphs: getAllParagraphs()
              }, '*');
            }
          });
        })();
      </script>
    `
        html = html.replace('</body>', interactionScript + '</body>')

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
