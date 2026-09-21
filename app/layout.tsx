import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceProvider } from "@/components/hostflow/client";

export const metadata: Metadata = {
  title: "HostFlow · Votre conciergerie",
  description:
    "Votre espace pour piloter votre conciergerie, vos équipes et vos opérations.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
