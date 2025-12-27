import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Toni Bover",
  description: "Toni Bover - Admin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentYear = new Date().getFullYear();

  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body className="min-h-screen bg-background text-primary font-sans antialiased flex flex-col">
        {children}

        <footer className="border-t border-subtle mt-auto">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <div className="flex justify-between items-center text-sm">
              <p className="text-muted font-serif">
                © Toni Bover, {currentYear}
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
