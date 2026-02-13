import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuickClaw — One-click OpenClaw hosting",
  description:
    "QuickClaw hosts OpenClaw agents for non-technical users. Paste your Telegram or Discord token, pick a plan, and deploy."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-void text-holo font-body">
        {children}
        <Toaster theme="dark" richColors closeButton />
      </body>
    </html>
  );
}
