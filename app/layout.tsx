import type { Metadata, Viewport } from 'next';
import { Google_Sans_Flex } from 'next/font/google';
import Script from 'next/script';
import AuthGuard from '@/components/AuthGuard';
import './globals.css';
import 'katex/dist/katex.min.css';

const googleSansFlex = Google_Sans_Flex({
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'AgentPrimer – AI Agent Platform',
  description:
    'A professional AI agent platform with skills, MCP, multi-agent support, and persistent memory.',
};

// Prevent iOS Safari from zooming in when the user taps an input field.
// interactive-widget=resizes-content keeps the layout stable when the keyboard opens.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the anti-flash script adds `dark` to className
    // before React hydrates, causing a benign server/client mismatch on <html>.
    <html lang="en" suppressHydrationWarning>
      <body className={googleSansFlex.className}>
        {/* beforeInteractive runs before hydration – prevents white flash in dark mode.
            dangerouslySetInnerHTML is required in Next.js 16 + React 19; inline children
            are no longer supported for <Script> tags in component trees. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('theme');if(s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');})();`,
          }}
        />
        <AuthGuard />
        {children}
      </body>
    </html>
  );
}
