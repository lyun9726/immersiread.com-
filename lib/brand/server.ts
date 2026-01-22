/**
 * Server-side brand detection utilities
 * 
 * 服务端品牌检测工具
 */

import { headers } from 'next/headers'
import { getBrandByDomain, type BrandConfig } from './config'

/**
 * Get brand config from request headers (server-side)
 * Call this in Server Components or API routes
 */
export async function getBrandFromHeaders(): Promise<BrandConfig> {
    const headersList = await headers()
    const brandId = headersList.get('x-brand')
    const domain = headersList.get('x-brand-domain') || headersList.get('host') || 'localhost'

    // If we have a brand ID from middleware, use it
    if (brandId === 'immersiread') {
        return getBrandByDomain('immersiread.com')
    }

    // Otherwise detect from domain
    return getBrandByDomain(domain)
}

/**
 * Get brand ID from request headers
 */
export async function getBrandId(): Promise<string> {
    const headersList = await headers()
    return headersList.get('x-brand') || 'omniread'
}

/**
 * Check if current brand is ImmersiRead
 */
export async function isImmersiRead(): Promise<boolean> {
    return (await getBrandId()) === 'immersiread'
}

/**
 * Check if current brand is OmniRead
 */
export async function isOmniRead(): Promise<boolean> {
    return (await getBrandId()) === 'omniread'
}
