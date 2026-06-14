import type { Metadata } from "next";

import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { FeedbackMount } from "@/components/FeedbackMount";

export const metadata: Metadata = {
  title: "Agent Platform",
  description: "0 → live → improve agent pipeline — console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
        <FeedbackMount />
      </body>
    </html>
  );
}
