/**
 * Brand Module Exports
 */

// Types and configs
export type { BrandConfig } from './config'
export {
    omnireadConfig,
    immersireadConfig,
    defaultConfig,
    brandConfigs,
    getBrandByDomain
} from './config'

// Client-side
export { BrandProvider, useBrand, useBrandName, useBrandSlogan } from './BrandContext'

// Server-side
export { getBrandFromHeaders, getBrandId, isImmersiRead, isOmniRead } from './server'
