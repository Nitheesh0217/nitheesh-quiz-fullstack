import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../components/AuthProvider';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Concentrate Portal - Canvas-Style School Platform',
  description: 'A Canvas-style school portal for class management, assignment submission, and rubric grading.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.className} suppressHydrationWarning>
      <head>
        {/* Anti-FOUC script: sets both `dark` (gates Tailwind's dark: utilities)
            and `light` (globals.css's prefers-color-scheme override checks
            for its absence) so an explicit light-mode choice on a
            dark-OS system renders correctly on the very first paint,
            not just after ThemeToggle's client-side effect runs. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              const savedTheme = localStorage.getItem('theme');
              const shouldBeDark = savedTheme ? savedTheme === 'dark' : prefersDark;
              document.documentElement.classList.toggle('dark', shouldBeDark);
              document.documentElement.classList.toggle('light', !shouldBeDark);
            } catch (e) {}
          })()
        ` }} />
      </head>
      <body className="bg-background text-foreground antialiased min-h-screen">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
