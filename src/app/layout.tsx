import React, { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SyncProvider } from "@/components/sync-provider";
import { QuickAddProvider } from "@/components/transaction/quick-add-context";
import { QuickAddModal } from "@/components/transaction/quick-add-modal";
import { Sidebar } from "@/components/navigation/sidebar";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { PwaManager } from "@/components/pwa-manager";
import { ServerSplashScreen } from "@/components/server-splash-screen";
import { SplashScreenClient } from "@/components/splash-screen-client";
import { ScrollContainer } from "@/components/navigation/scroll-container";
import { QueryProvider } from "@/components/query-provider";
import { TabNavigationProvider } from "@/components/navigation/tab-navigation-context";
import { NativeTabContainer } from "@/components/navigation/native-tab-container";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F8FB" },
    { media: "(prefers-color-scheme: dark)", color: "#0B111E" },
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
    statusBarStyle: "default",
    title: "Hard Money",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme-pack="private-wealth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("hardmoney-theme");var m=window.matchMedia("(prefers-color-scheme: dark)");var d=t==="dark"||(!t&&m.matches);if(d){document.documentElement.classList.add("dark");document.documentElement.setAttribute("data-theme","dark");}else{document.documentElement.classList.remove("dark");document.documentElement.setAttribute("data-theme","light");}if(localStorage.getItem("hardmoney-color-swap")==="true"){document.documentElement.setAttribute("data-color-swap","true");}document.documentElement.setAttribute("data-theme-pack","private-wealth");var isTest=Boolean(window.navigator.webdriver)||location.search.indexOf("nosplash")!==-1||location.search.indexOf("e2e=true")!==-1;var nav=window.navigator;var isPwa=Boolean(nav&&(nav.standalone||window.matchMedia("(display-mode: standalone)").matches||window.matchMedia("(display-mode: fullscreen)").matches));var shown=sessionStorage.getItem("hardmoney_splash_shown");if(isTest||(!isPwa&&shown&&location.search.indexOf("splash=1")===-1)){document.documentElement.classList.add("hm-splash-hidden");}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="fixed inset-0 w-full overflow-hidden overscroll-none bg-app text-[var(--text)]">
        {/* 1. First Server-Rendered Layer: Instant PWA & Cold Start Splash Screen (0ms first paint) */}
        <ServerSplashScreen />
        <SplashScreenClient />

        <ThemeProvider>
          <Suspense fallback={null}>
            <QueryProvider>
              <SyncProvider>
                <QuickAddProvider>
                  <TabNavigationProvider>
                    <div className="flex h-full w-full overflow-hidden pt-shell-safe">
                      {/* Desktop Collapsible Sidebar */}
                      <Sidebar />

                      {/* Main Application Column: Scrollable Content + Non-Overlapping Docked Mobile Footer */}
                      <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-hidden relative">
                        <ScrollContainer className="flex-1 min-h-0 overflow-y-auto md:pb-8">
                          <NativeTabContainer>
                            {children}
                          </NativeTabContainer>
                        </ScrollContainer>

                        {/* Mobile Docked Bottom Navigation (Split Lens) */}
                        <BottomNav />
                      </div>

                      {/* Global Quick-Add Modal */}
                      <QuickAddModal />

                      {/* PWA Service Worker & Update Handler */}
                      <PwaManager />
                    </div>
                  </TabNavigationProvider>
                </QuickAddProvider>
              </SyncProvider>
            </QueryProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
