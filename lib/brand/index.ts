/**
 * Brand Module Exports - Client-safe exports only
 * 
 * For server-side functions, import directly from './server'
 */

// Types and configs (safe for both client and server)
export type { BrandConfig } from './config'
export {
    omnireadConfig,
    immersireadConfig,
    defaultConfig,
    brandConfigs,
    getBrandByDomain
} from './config'

// Client-side only
export { BrandProvider, useBrand, useBrandName, useBrandSlogan } from './BrandContext'

// NOTE: Server-side functions are NOT exported here to avoid client-side import errors
// For server-side use, import directly:
// import { getBrandFromHeaders, getBrandId } from '@/lib/brand/server'
