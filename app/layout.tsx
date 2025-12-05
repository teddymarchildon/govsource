import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { AuthProvider } from '../contexts/AuthContext';
import { SidebarProvider } from '../contexts/SidebarContext';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/next"
import FeedbackForm from '@/components/FeedbackForm';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'GovSource - AI-Powered Legislative Insights | Track Members of Congress',
  description: 'Track US Congress members, congressman, and legislative activities with AI-powered insights. Discover bills, laws, and government information.',
  keywords: 'congressman, members of congress, congress members, us congressman, legislative tracking, government data, bills, laws',
  icons: {
    icon: '/favicon.png',
  },
  openGraph: {
    title: 'GovSource - AI-Powered Legislative Insights | Track Members of Congress',
    description: 'Track US Congress members, congressman, and legislative activities with AI-powered insights. Discover bills, laws, and government information.',
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
          <SidebarProvider>
            <div className="min-h-screen bg-gray-50">
              <Header />
              <Sidebar />
              <main className="md:ml-64 pt-16 md:pt-16 p-4 md:p-6">
                {children}
              </main>
            </div>
            <FeedbackForm />
          </SidebarProvider>
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
