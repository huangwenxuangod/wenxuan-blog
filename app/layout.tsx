import type { Metadata } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { ToastProvider } from "@/components/Toast";
import { CustomJsInjector } from "@/components/CustomJsInjector";
import type { Theme } from "@/lib/appearance";
import { FONT_CONFIG, THEME_OPTIONS, THEME_STORAGE_KEY, normalizeTheme } from "@/lib/appearance";
import { BACKOFFICE_THEME_STORAGE_KEY } from "@/lib/backoffice-theme";
import { getAppCloudflareEnv } from "@/lib/cloudflare";
import { getSetting } from "@/lib/db";
import { resolveDefaultSiteCoverImage } from "@/lib/default-cover-images";
import { getSiteUrl, getSiteUrlObject } from "@/lib/site-config";

const geistSans = localFont({
  src: [
    { path: "./fonts/geist/Geist-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/geist/Geist-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/geist/Geist-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/geist/Geist-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
  fallback: ["system-ui", "Arial", "Helvetica", "sans-serif"],
});

const geistMono = localFont({
  src: [
    { path: "./fonts/geist/GeistMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/geist/GeistMono-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/geist/GeistMono-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/geist/GeistMono-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["SFMono-Regular", "Consolas", "Monaco", "monospace"],
});

const SITE_URL = getSiteUrl()
const DEFAULT_SITE_OG_IMAGE = resolveDefaultSiteCoverImage(SITE_URL)

export const metadata: Metadata = {
  metadataBase: getSiteUrlObject(),
  title: {
    default: '文轩',
    template: '%s · 文轩',
  },
  description: '记录思考，分享所学，留住当下。',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  alternates: {
    types: {
      'application/rss+xml': '/feed.xml',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: SITE_URL,
    siteName: '文轩',
    title: '文轩',
    description: '记录思考，分享所学，留住当下。',
    images: [
      {
        url: DEFAULT_SITE_OG_IMAGE,
        width: 1280,
        height: 720,
        alt: '文轩',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@hungxun254458',
    creator: '@hungxun254458',
    title: '文轩',
    description: '记录思考，分享所学，留住当下。',
    images: [DEFAULT_SITE_OG_IMAGE],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies()
  let customJs = ''
  let bodyFont = ''
  let defaultTheme: Theme = 'default'
  try {
    const env = await getAppCloudflareEnv()
    if (env?.DB) {
      const [customJsValue, bodyFontValue, defaultThemeValue] = await Promise.all([
        getSetting(env.DB, 'custom_js'),
        getSetting(env.DB, 'body_font'),
        getSetting(env.DB, 'default_theme'),
      ])
      customJs = customJsValue || ''
      bodyFont = bodyFontValue || ''
      defaultTheme = normalizeTheme(defaultThemeValue)
    }
  } catch {}

  const cookieTheme = normalizeTheme(cookieStore.get(THEME_STORAGE_KEY)?.value, defaultTheme)
  const resolvedTheme = cookieTheme

  const font = FONT_CONFIG[bodyFont]
  const validThemes = THEME_OPTIONS.map((theme) => theme.id)

  const appearanceApplyScript = `
(function(){
  var f = ${JSON.stringify(FONT_CONFIG)};
  var k = "${bodyFont || ''}";
  var defaultTheme = "${resolvedTheme}";
  var themeStorageKey = "${THEME_STORAGE_KEY}";
  var backofficeThemeStorageKey = "${BACKOFFICE_THEME_STORAGE_KEY}";
  var validThemes = ${JSON.stringify(validThemes)};
  function isTheme(value) {
    return validThemes.indexOf(value) !== -1;
  }
  function applyFont(key) {
    var c = f[key];
    document.documentElement.setAttribute('data-font', key || 'default');
    if (c) {
      document.documentElement.style.setProperty('--body-font', c.family);
      if (c.link && !document.getElementById('qm-font-link')) {
        var l = document.createElement('link');
        l.id = 'qm-font-link';
        l.rel = 'stylesheet';
        l.href = c.link;
        document.head.appendChild(l);
      }
    } else {
      document.documentElement.style.removeProperty('--body-font');
    }
  }
  function applyTheme(theme) {
    if (isTheme(theme) && theme !== 'default') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  applyFont(k);
  applyTheme(defaultTheme);
  try {
    var savedBackofficeTheme = window.localStorage.getItem(backofficeThemeStorageKey);
    if (savedBackofficeTheme === 'light' || savedBackofficeTheme === 'dark') {
      document.documentElement.setAttribute('data-admin-theme', savedBackofficeTheme);
    }
  } catch (e) {}
  try {
    var savedTheme = window.localStorage.getItem(themeStorageKey);
    if (isTheme(savedTheme)) applyTheme(savedTheme);
  } catch (e) {}
})();
`

  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-font={bodyFont || 'default'}
      data-theme={resolvedTheme !== 'default' ? resolvedTheme : undefined}
      suppressHydrationWarning
    >
      <head>
        {font?.link && <link rel="stylesheet" href={font.link} />}
        {font && (
          <style dangerouslySetInnerHTML={{ __html: `:root { --body-font: ${font.family}; }` }} />
        )}
        <script dangerouslySetInnerHTML={{ __html: appearanceApplyScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <GlobalShortcuts />
          {children}
        </ToastProvider>
        {customJs && <CustomJsInjector code={customJs} />}
      </body>
    </html>
  );
}
