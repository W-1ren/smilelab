import type { Metadata, Viewport } from "next";
import "./globals.css";

function resolveMetadataBase() {
  const explicitUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.URL;
  if (explicitUrl) return new URL(explicitUrl);

  const [owner, repository] = process.env.GITHUB_REPOSITORY?.split("/") ?? [];
  if (owner && repository) return new URL(`https://${owner}.github.io/${repository}/`);

  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "Smile Interaction — 用笑容触发天气与烟花",
  description: "在浏览器中用微笑触发雨、大笑触发可与头部碰撞的烟花。人脸识别仅在本机进行。",
  applicationName: "Smile Interaction",
  openGraph: {
    title: "Smile Interaction",
    description: "Smile for rain. Laugh for fireworks.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Smile Interaction",
    description: "Smile for rain. Laugh for fireworks.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#070b10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
