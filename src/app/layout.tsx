import React, { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SyncProvider } from "@/components/sync-provider";
import { QuickAddProvider } from "@/components/transaction/quick-add-context";
import { QuickAddModal } from "@/components/transaction/quick-add-modal";
import { Sidebar } from "@/components/navigation/sidebar";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Fab } from "@/components/ui/fab";
import { PwaManager } from "@/components/pwa-manager";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export const metadata: Metadata = {
  title: "Hard Money",
  description: "Local-first personal treasury & double-entry financial ledger",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hard Money",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className="h-screen w-screen overflow-hidden bg-app text-[var(--text)]">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("hardmoney-theme");var m=window.matchMedia("(prefers-color-scheme: dark)");var d=t==="dark"||(!t&&m.matches);if(d){document.documentElement.classList.add("dark");document.documentElement.setAttribute("data-theme","dark");}else{document.documentElement.classList.remove("dark");document.documentElement.setAttribute("data-theme","light");}if(localStorage.getItem("hardmoney-color-swap")==="true"){document.documentElement.setAttribute("data-color-swap","true");}}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
          <Suspense fallback={null}>
            <SyncProvider>
              <QuickAddProvider>
                <div className="flex h-full w-full overflow-hidden">
                  {/* Desktop Collapsible Sidebar */}
                  <Sidebar />

                  {/* Main Application Area */}
                  <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
                    <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
                      {children}
                    </div>

                    {/* Floating Action Button */}
                    <Fab />
                  </div>

                  {/* Mobile Bottom Navigation */}
                  <BottomNav />

                  {/* Global Quick-Add Modal */}
                  <QuickAddModal />

                  {/* PWA Service Worker & Update Handler */}
                  <PwaManager />
                </div>
              </QuickAddProvider>
            </SyncProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
