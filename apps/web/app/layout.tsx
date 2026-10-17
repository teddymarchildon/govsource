import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BriefAnalytics from '@/components/briefs/BriefAnalytics';
import TopNav from '../components/TopNav';
import { AuthProvider } from '../contexts/AuthContext';
import { NavigationProvider } from '../contexts/NavigationContext';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/next"
import { getTopics } from '@/lib/repositories/topics';

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
  const topics = await getTopics();

  return (
    <html lang="en" className={`${inter.variable}`}>
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1561540818681527"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${inter.className} font-sans`}>
        <AuthProvider>
          <NavigationProvider>
            <div className="flex min-h-screen flex-col bg-background">
              <Header />
              <TopNav topics={topics.map(({ id, slug, name }) => ({ id, slug, name }))} />
              <main className="flex-1 p-4 pt-14 md:p-6 md:pt-24">
                {children}
              </main>
              <Footer />
            </div>
          </NavigationProvider>
        </AuthProvider>
        <BriefAnalytics />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
