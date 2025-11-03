import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";
import SiteDock from "../components/site-dock";
import SiteFooter from "../components/site-footer";
import TransitionViewport from "../components/transition-viewport";
import { TransitionProvider } from "../components/transition-context";

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
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#ffffff",
        },
        elements: {
          formButtonPrimary:
            "bg-white text-black hover:bg-white/90 focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-black",
        },
      }}
      signInUrl="/login"
      signUpUrl="/signup"
    >
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-black font-sans text-white antialiased`}
        >
          <TransitionProvider>
            <div className="flex min-h-screen flex-col">
              <TransitionViewport>
                <div className="min-h-full bg-gradient-to-br from-black via-black to-neutral-950 pb-28 lg:pb-36">
                  {children}
                </div>
              </TransitionViewport>
              <SiteFooter />
            </div>
            <SiteDock />
          </TransitionProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
