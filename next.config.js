/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/therapist', destination: '/therapists', permanent: true },
    ];
  },
};
module.exports = nextConfig;
