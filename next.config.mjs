import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin(
  './i18n/request.ts' // This is the default and can be omitted
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['canvas'],
  webpack: (config) => {
    config.externals.push({
      canvas: 'commonjs canvas',
    });
    return config;
  },
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  // Enable static optimization where possible
  experimental: {
    optimizeCss: true,
  },
  // Headers for better caching
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|png|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
