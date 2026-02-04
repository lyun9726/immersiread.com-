import { getBrandFromHeaders } from '@/lib/brand/server'
import { NextResponse } from 'next/server'

export async function GET() {
    const brand = await getBrandFromHeaders()
    const verificationId = brand.seo.bingVerificationId

    if (!verificationId) {
        return new NextResponse('Bing verification not configured', { status: 404 })
    }

    const xml = `<?xml version="1.0"?>
<users>
	<user>${verificationId}</user>
</users>`

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/xml',
        },
    })
}
