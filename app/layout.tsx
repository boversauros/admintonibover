'use client';

import { AuthProvider } from '@/lib/auth/AuthContext';
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentYear = new Date().getFullYear();

  return (
    <html lang="en">
      <head>
        <title>Toni Bover - Admin</title>
        <meta name="description" content="Toni Bover - Admin" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body className="min-h-screen bg-background text-primary font-sans antialiased flex flex-col">
        <AuthProvider>
          {children}
        </AuthProvider>

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
