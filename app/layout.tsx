import type { Metadata } from 'next';
import { connection } from 'next/server';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { getCognitoConfig } from '@/lib/auth/cognito/config';
import { readCognitoSession } from '@/lib/auth/cognito/session';
import './globals.css';

export const metadata: Metadata = {
  title: 'Toni Bover - Admin',
  description: 'Toni Bover - Admin',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();

  const currentYear = new Date().getFullYear();
  const cognitoSession = await readCognitoSession(getCognitoConfig());

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-primary font-sans antialiased flex flex-col">
        <AuthProvider initialUser={cognitoSession?.user ?? null}>
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
