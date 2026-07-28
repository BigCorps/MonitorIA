import type { Metadata, Viewport } from "next";
import { appConfig } from "@/src/lib/app-config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://monitoria.bigcorps.com.br"),
  title: {
    default: `${appConfig.name} — ${appConfig.slogan}`,
    template: `%s · ${appConfig.name}`,
  },
  description: appConfig.description,
  applicationName: appConfig.name,
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: `${appConfig.name} — ${appConfig.slogan}`,
    description: appConfig.description,
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07111f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
