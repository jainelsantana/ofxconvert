import "./globals.css";

export const metadata = {
  title: "ConvertOFX · ORA Empresas",
  description: "Converta arquivos OFX em PDF e Excel automaticamente.",
  icons: {
    icon: "/static/favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
