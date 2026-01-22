/**
 * Brand Configuration Types and Configs
 * 
 * 品牌配置 - 支持多域名多品牌
 */

export interface BrandConfig {
    id: string
    domain: string
    name: {
        zh: string
        en: string
    }
    slogan: {
        zh: string
        en: string
    }
    logo: {
        light: string  // Logo for light background
        dark: string   // Logo for dark background
        icon: string   // Square icon (favicon, app icon)
    }
    colors: {
        primary: string
        primaryForeground: string
        accent: string
    }
    seo: {
        titleSuffix: {
            zh: string
            en: string
        }
        description: {
            zh: string
            en: string
        }
    }
    social: {
        twitter?: string
        github?: string
    }
    features: {
        showWatermark: boolean
    }
}

// Brand A: OmniRead (existing)
export const omnireadConfig: BrandConfig = {
    id: 'omniread',
    domain: 'omniread.app',
    name: {
        zh: '通阅',
        en: 'OmniRead'
    },
    slogan: {
        zh: '智能阅读，无界沟通',
        en: 'Read everything intelligently'
    },
    logo: {
        light: '/brands/omniread/logo-light.svg',
        dark: '/brands/omniread/logo-dark.svg',
        icon: '/brands/omniread/icon.png'
    },
    colors: {
        primary: '#6366f1',           // Indigo
        primaryForeground: '#ffffff',
        accent: '#8b5cf6'             // Purple accent
    },
    seo: {
        titleSuffix: {
            zh: ' | 通阅 - 智能阅读',
            en: ' | OmniRead'
        },
        description: {
            zh: '通阅是一款智能阅读工具，支持多语言翻译、TTS朗读、AI总结等功能。',
            en: 'OmniRead is an intelligent reading tool with translation, TTS, and AI features.'
        }
    },
    social: {
        github: 'https://github.com/lyun9726/omniread'
    },
    features: {
        showWatermark: false
    }
}

// Brand B: ImmersiRead (new)
export const immersireadConfig: BrandConfig = {
    id: 'immersiread',
    domain: 'immersiread.com',
    name: {
        zh: '沉浸式阅读',
        en: 'ImmersiRead'
    },
    slogan: {
        zh: '深度阅读，无障碍体验',
        en: 'Deep reading, no barriers'
    },
    logo: {
        light: '/brands/immersiread/logo-light.svg',
        dark: '/brands/immersiread/logo-dark.svg',
        icon: '/brands/immersiread/icon.png'
    },
    colors: {
        primary: '#4f46e5',           // Deep indigo/purple
        primaryForeground: '#ffffff',
        accent: '#7c3aed'             // Violet accent
    },
    seo: {
        titleSuffix: {
            zh: ' | 沉浸式阅读',
            en: ' | ImmersiRead'
        },
        description: {
            zh: '沉浸式阅读是一款专业的双语阅读工具，支持EPUB、PDF翻译和TTS朗读。',
            en: 'ImmersiRead is a professional bilingual reading tool with EPUB, PDF translation and TTS.'
        }
    },
    social: {},
    features: {
        showWatermark: false
    }
}

// Default config for development
export const defaultConfig: BrandConfig = omnireadConfig

// All brand configs indexed by domain
export const brandConfigs: Record<string, BrandConfig> = {
    'omniread.app': omnireadConfig,
    'www.omniread.app': omnireadConfig,
    'immersiread.com': immersireadConfig,
    'www.immersiread.com': immersireadConfig,
    // Development
    'localhost': omnireadConfig,
}

/**
 * Get brand config by domain
 */
export function getBrandByDomain(domain: string): BrandConfig {
    // Remove port if present
    const host = domain.split(':')[0]

    // Exact match
    if (brandConfigs[host]) {
        return brandConfigs[host]
    }

    // Subdomain match (e.g., *.omniread.app)
    for (const [key, config] of Object.entries(brandConfigs)) {
        if (host.endsWith(`.${key.replace('www.', '')}`)) {
            return config
        }
    }

    // Default
    return defaultConfig
}
