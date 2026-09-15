import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Užrašai — susitikimų pokalbiai lietuviškai",
  description:
    "Įrašykite kambario susitikimą, atskirkite kelis kalbėtojus ir gaukite viso pokalbio aprašymą lietuvių kalba.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lt">
      <body className={`${geistSans.variable} ${newsreader.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
