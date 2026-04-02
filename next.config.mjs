/** @type {import('next').NextConfig} */
const nextConfig = {
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
