import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteDock from "../components/site-dock";
import SiteFooter from "../components/site-footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Goguma Chat",
    template: "%s | Goguma Chat",
  },
  description:
    "An elegant black-and-white workspace where teams nurture every conversation.",
  metadataBase: new URL("https://goguma.chat"),
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-black font-sans text-white antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <div className="flex-1 bg-gradient-to-br from-black via-black to-neutral-950 pb-28 lg:pb-36">
            {children}
          </div>
          <SiteFooter />
        </div>
        <SiteDock />
      </body>
    </html>
  );
}
