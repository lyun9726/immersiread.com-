import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';

// Create the next-intl middleware
const intlMiddleware = createMiddleware({
    // A list of all locales that are supported
    locales: ['en', 'zh', 'ja', 'ko', 'fr', 'es', 'de'],

    // Used when no locale matches
    defaultLocale: 'en'
});

/**
 * Combined Middleware: i18n + Multi-brand Detection
 */
export default function middleware(request: NextRequest) {
    // Get the domain for brand detection
    const host = request.headers.get('host') || 'localhost';
    const domain = host.split(':')[0]; // Remove port

    let brandId = 'omniread'; // Default

    // Detect brand by domain
    if (domain.includes('immersiread.com')) {
        brandId = 'immersiread';
    } else if (domain.includes('omniread.app')) {
        brandId = 'omniread';
    }

    // Run the intl middleware first
    const response = intlMiddleware(request);

    // Add brand headers to the response
    if (response) {
        response.headers.set('x-brand', brandId);
        response.headers.set('x-brand-domain', domain);
    }

    return response;
}

export const config = {
    // Match all pathnames except for
    // - … if they start with `/api`, `/_next` or `/_vercel`
    // - … the ones containing a dot (e.g. `favicon.ico`)
    matcher: ['/((?!api|_next|_vercel|.*\\..*).*)', '/']
};
