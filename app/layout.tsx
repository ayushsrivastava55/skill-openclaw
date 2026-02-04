import type { Metadata } from "next";
import { Toaster } from "sonner";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "SimpleClaw — Deploy OpenClaw under 1 Minute",
  description:
    "Deploy OpenClaw under 1 minute. Avoid technical complexity and one-click deploy your own 24/7 OpenClaw runtime.",
  metadataBase: new URL("https://simpleclaw.example.com")
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="text-white antialiased font-sans">
        {children}
        <Toaster theme="dark" richColors closeButton />
      </body>
    </html>
  );
}
