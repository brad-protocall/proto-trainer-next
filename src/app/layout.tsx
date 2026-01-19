import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Proto Trainer',
  description: 'Crisis counselor training platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
