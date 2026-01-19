import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proto Trainer",
  description: "Crisis counselor training with voice roleplay and AI evaluation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-marfa antialiased">{children}</body>
    </html>
  );
}
