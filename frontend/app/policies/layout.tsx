import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Policies — Restaurant Financial System',
  description: 'Privacy, security, acceptable use and cookie policies for the Restaurant Financial System.',
};

export default function PoliciesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
