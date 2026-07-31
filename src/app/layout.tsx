import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { SettingsProvider } from "@/components/settings/SettingsProvider";
import { loadSettingsForSession } from "@/lib/settings/session";
import "./globals.css";

// Archivo's slightly narrow grotesque fits more of a task name on a row; Plex Mono keeps
// the priority, effort, and deadline columns aligned on the digit.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Planner",
  description: "Personal time management, in the spirit of Achieve Planner",
};

/**
 * Preferences load here, once, rather than in each page: they are read by grids on every
 * tab, and the server render is the only read path — delivering them in the first HTML is
 * what keeps a saved column layout from flashing the default one first.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await loadSettingsForSession();

  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col">
        <SettingsProvider initial={settings}>{children}</SettingsProvider>
      </body>
    </html>
  );
}
