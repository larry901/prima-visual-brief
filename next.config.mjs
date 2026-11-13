/** @type {import('next').NextConfig} */
const nextConfig = {
  // /hub/ is the PWA start URL. Leaving the trailing slash in place keeps it inside the manifest scope.
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: '/hub/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' }],
      },
      {
        source: '/hub/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/hub/' },
        ],
      },
    ]
  },
  experimental: {
    // Raise the body size limit for the file upload API route (default is 4 MB).
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: 'mosaic.scdn.co' },
    ],
  },
}

export default nextConfig
