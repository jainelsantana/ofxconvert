/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Estas dependências são necessárias em runtime e não devem ser empacotadas pelo webpack
  serverExternalPackages: ["nodemailer", "exceljs", "pdf-lib"],
};

module.exports = nextConfig;
