import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';
import TopNav from '../components/TopNav';
import { AuthProvider } from '../contexts/AuthContext';
import { NavigationProvider } from '../contexts/NavigationContext';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/next"

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.govsrc.com'),
  title: {
    default: 'GovSource - Federal Public Records, Made Clear',
    template: '%s | GovSource',
  },
  description: 'Explore federal bills, laws, executive orders, agency actions, and court decisions with clear context and links to official sources.',
  keywords: 'congress members, us congress members, legislative tracking, government data, bills, laws',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'GovSource - Federal Public Records, Made Clear',
    description: 'Explore federal bills, laws, executive orders, agency actions, and court decisions with clear context and links to official sources.',
    url: 'https://www.govsrc.com',
    siteName: 'GovSource',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
          <NavigationProvider>
            <div className="min-h-screen bg-background">
              <Header />
              <TopNav />
              <main className="p-4 pt-16 md:p-6 md:pt-[7.5rem]">
                {children}
              </main>
            </div>
          </NavigationProvider>
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
