import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { AuthProvider } from '../contexts/AuthContext';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/next"

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'GovSource - See for yourself',
  description: 'Track legislative activities and congressman',
  icons: {
    icon: '/favicon.png',
  },
  openGraph: {
    title: 'GovSource - See for yourself',
    description: 'Track legislative activities, executive orders, agencies, and congressman',
    url: 'https://www.govsrc.com',
    siteName: 'GovSource',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className={`${inter.className} font-sans`}>
        <AuthProvider>
          <div className="min-h-screen bg-gray-50">
            <Header />
            <Sidebar />
            <main className="md:ml-64 pt-16 md:pt-16 p-4 md:p-6">
              {children}
            </main>
          </div>
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
