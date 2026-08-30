import type { Metadata } from "next";
import "./globals.css";
import { AppStoreProvider } from "@/lib/app-store";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "KV Mechelen Scouting Hub",
  description:
    "Internal football scouting and recruitment dashboard for KV Mechelen.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AppStoreProvider>
          <AppShell>{children}</AppShell>
        </AppStoreProvider>
      </body>
    </html>
  );
}
