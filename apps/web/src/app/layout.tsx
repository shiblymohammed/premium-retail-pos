import type { Metadata } from 'next';
import './globals.css';
import AppFrame from '../components/app-frame';

export const metadata: Metadata = {
  title: 'Premium Retail POS',
  description: 'Multi-location retail management, inventory ledger, and point-of-sale system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><AppFrame>{children}</AppFrame></body>
    </html>
  );
}
