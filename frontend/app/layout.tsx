import './globals.css';
import type { Metadata } from 'next';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';

export const metadata: Metadata = {
  title: 'Restaurant Financial System',
  description: 'Financial & Cash Management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
