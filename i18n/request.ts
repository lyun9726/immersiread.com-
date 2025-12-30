import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ requestLocale }) => {
    // This typically corresponds to the `[locale]` segment
    let locale = await requestLocale;

    // Supported UI locales
    const supportedLocales = ['en', 'zh', 'ja', 'ko', 'fr', 'es', 'de'];

    // Ensure that a valid locale is used
    if (!locale || !supportedLocales.includes(locale)) {
        locale = 'en';
    }

    return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default
    };
});
