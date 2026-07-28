import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { EditModeProvider } from "@/components/EditModeProvider";
import { InputShortcutProvider } from "@/components/InputShortcutProvider";

// One typeface across the whole app. DM Sans is a variable font, so every
// weight used (400 body → 600/700 headings) comes from this single load.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "HARTS · Customer Pulse",
  description:
    "An emotional, sentiment-led view of HARTS' customer transformation programmes."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="font-sans">
        {/* EditModeProvider wraps the shortcut provider: the chooser's "Edit
            this page" needs to reach into the edit session, and the draft
            store has to outlive any single page so edits can span the pulse
            page and its programme pages before one Publish. */}
        <EditModeProvider>
          <InputShortcutProvider>{children}</InputShortcutProvider>
        </EditModeProvider>
      </body>
    </html>
  );
}
