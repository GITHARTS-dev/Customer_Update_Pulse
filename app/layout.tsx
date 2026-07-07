import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { InputShortcutProvider } from "@/components/InputShortcutProvider";
import { PROGRAMMES } from "@/lib/programmes";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap"
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
  display: "swap"
});

export const metadata: Metadata = {
  title: "HARTS × Evora — Pulse",
  description: `An emotional, sentiment-led view of the ${PROGRAMMES.length} active HARTS × Evora transformation programmes.`
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable}`}>
      <body className="font-sans">
          <InputShortcutProvider>{children}</InputShortcutProvider>
        </body>
    </html>
  );
}
