'use client'

/**
 * Brand Context - Client-side brand configuration access
 * 
 * 客户端品牌配置 Context
 */

import { createContext, useContext, ReactNode } from 'react'
import type { BrandConfig } from './config'
import { omnireadConfig } from './config'

const BrandContext = createContext<BrandConfig>(omnireadConfig)

interface BrandProviderProps {
    brand: BrandConfig
    children: ReactNode
}

export function BrandProvider({ brand, children }: BrandProviderProps) {
    return (
        <BrandContext.Provider value={brand}>
            {children}
        </BrandContext.Provider>
    )
}

/**
 * Hook to access brand config in client components
 */
export function useBrand(): BrandConfig {
    return useContext(BrandContext)
}

/**
 * Hook to get localized brand name
 */
export function useBrandName(locale: string = 'en'): string {
    const brand = useBrand()
    return locale === 'zh' ? brand.name.zh : brand.name.en
}

/**
 * Hook to get localized slogan
 */
export function useBrandSlogan(locale: string = 'en'): string {
    const brand = useBrand()
    return locale === 'zh' ? brand.slogan.zh : brand.slogan.en
}
