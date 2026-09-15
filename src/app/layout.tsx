import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

const wordmark = Barlow_Condensed({
  variable: "--font-wordmark",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Užrašai — susitikimų protokolas",
  description:
    "Įrašykite kambario susitikimą, atskirkite kalbėtojus ir gaukite viso pokalbio aprašymą lietuvių kalba.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lt" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} ${wordmark.variable} antialiased`}>{children}</body>
    </html>
  );
}
