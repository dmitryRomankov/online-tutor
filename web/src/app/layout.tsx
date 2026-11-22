import type { Metadata } from 'next';
import { Providers } from './providers';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lesson Workspace',
  description: 'A shared workspace for one-to-one online lessons.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
