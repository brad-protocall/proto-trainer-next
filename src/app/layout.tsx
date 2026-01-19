import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proto Training Guide",
  description: "AI-powered training simulator for crisis counselors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-700 min-h-screen antialiased">{children}</body>
    </html>
  );
}
