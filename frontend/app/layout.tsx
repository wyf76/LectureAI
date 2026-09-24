import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LectureAI — Less replaying. More understanding.",
  description: "Turn lecture recordings into transcripts and study notes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
