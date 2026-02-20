import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brand Deploy Console",
  description:
    "Deploy AI-powered Telegram bots with brand-specific capabilities."
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
