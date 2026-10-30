import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — Restaurant Financial System',
  description: 'About the Restaurant Financial System, its developer and contact details.',
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
