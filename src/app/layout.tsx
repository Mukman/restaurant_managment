import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLang } from "@/lib/lang";

export async function generateMetadata(): Promise<Metadata> {
  const am = (await getLang()) === "am";
  return {
    title: am ? "አዲስ POS" : "Addis POS",
    description: am ? "ለኢትዮጵያ ሱቆችና ምግብ ቤቶች የሽያጭና ክምችት መቆጣጠሪያ" : "Point of sale and inventory for Ethiopian shops and restaurants",
  };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#2b4f3d" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;600;700;800&family=Noto+Sans+Ethiopic:wght@400;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
