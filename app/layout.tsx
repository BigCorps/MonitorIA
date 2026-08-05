import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { appConfig } from "@/src/lib/app-config";
import "./globals.css";

/**
 * Archivo (Omnibus-Type, SIL OFL 1.1) — variável, com eixo de largura.
 * O eixo `wdth` é o que dá caráter aos títulos sem trocar de família.
 * Cobertura de diacríticos do português vem de `latin-ext`.
 *
 * Se o build reclamar do eixo, remova a linha `axes` — a página continua
 * funcionando, apenas sem o estreitamento dos títulos.
 */
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-display",
});

/** Usada só em horário, preço e código de plano. Dígitos de largura fixa. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(appConfig.url),
  title: {
    default: `${appConfig.name} — ${appConfig.slogan}`,
    template: `%s · ${appConfig.name}`,
  },
  description: appConfig.description,
  applicationName: appConfig.name,
  category: "technology",
  creator: appConfig.company,
  publisher: appConfig.company,
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: appConfig.name,
  },
  openGraph: {
    title: `${appConfig.name} — ${appConfig.slogan}`,
    description: appConfig.description,
    url: appConfig.url,
    siteName: appConfig.name,
    type: "website",
    locale: appConfig.locale,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: `${appConfig.name} — ${appConfig.slogan}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${appConfig.name} — ${appConfig.slogan}`,
    description: appConfig.description,
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: googleVerification ? { google: googleVerification } : undefined,
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07111F",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={appConfig.language} className={`${archivo.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
