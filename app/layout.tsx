import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Festive Monitor',
  description: 'Watches the FIVE festive events site for new, removed, unpublished and broken events.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
