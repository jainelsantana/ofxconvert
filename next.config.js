/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['nodemailer', 'exceljs', 'pdf-lib'],
};

module.exports = nextConfig;
