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
};

export default withNextIntl(nextConfig);
