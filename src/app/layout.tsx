import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppShell } from "./app-shell";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={cn(inter.className, "min-h-screen antialiased")}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
