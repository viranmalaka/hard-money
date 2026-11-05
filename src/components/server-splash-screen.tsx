import React from "react";
import { Landmark, ShieldCheck, Sparkles, X } from "lucide-react";

/**
 * ServerSplashScreen:
 * Rendered at the very first server-rendered HTML layer in RootLayout.
 * Contains pure CSS 3D keyframe animations and SVG vector banknotes.
 * Renders on frame 0 (first paint) before any JavaScript or React bundles load,
 * guaranteeing zero home-screen flicker or unstyled content during PWA launch / cold start.
 */
export function ServerSplashScreen() {
  return (
    <div
      id="hm-splash-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Hard Money Application Loading"
      className="hm-splash-container"
    >
      {/* Inline styles for zero-delay hardware-accelerated CSS 3D animations */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* Instant hidden state if session already showed or in test */
            html.hm-splash-hidden #hm-splash-screen {
              display: none !important;
            }

            .hm-splash-container {
              position: fixed;
              inset: 0;
              width: 100vw;
              height: 100vh;
              z-index: 999999;
              background: radial-gradient(circle at 50% 50%, #0c1527 0%, #070b13 70%, #04070c 100%);
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              overflow: hidden;
              user-select: none;
              color: #f1f5f9;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              opacity: 1;
              transform: scale(1);
              transition: opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), filter 0.45s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .hm-splash-container.hm-splash-exit {
              opacity: 0 !important;
              transform: scale(1.04) !important;
              filter: blur(10px) !important;
              pointer-events: none !important;
            }

            /* 3D Scene Viewport */
            .hm-scene-3d {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              perspective: 1000px;
              perspective-origin: 50% 50%;
              overflow: hidden;
              pointer-events: none;
            }

            /* Flow Stream SVG Curves */
            .hm-stream-svg {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
            }

            .hm-stream-inflow {
              stroke-dasharray: 8 14;
              animation: hmStreamFlowIn 1.8s linear infinite;
            }

            .hm-stream-outflow {
              stroke-dasharray: 8 14;
              animation: hmStreamFlowOut 1.8s linear infinite;
            }

            @keyframes hmStreamFlowIn {
              from { stroke-dashoffset: 44; }
              to { stroke-dashoffset: 0; }
            }

            @keyframes hmStreamFlowOut {
              from { stroke-dashoffset: 0; }
              to { stroke-dashoffset: -44; }
            }

            /* 3D Banknote Base */
            .hm-note-3d {
              position: absolute;
              width: 130px;
              height: 68px;
              transform-style: preserve-3d;
              will-change: transform, opacity;
              border-radius: 6px;
              box-shadow: 0 16px 32px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.3);
            }

            @media (min-width: 640px) {
              .hm-note-3d {
                width: 154px;
                height: 80px;
              }
            }

            /* Banknote Holographic Foil */
            .hm-note-foil {
              position: absolute;
              top: 0;
              bottom: 0;
              width: 14px;
              left: 65%;
              background: linear-gradient(135deg, rgba(56,189,248,0.5) 0%, rgba(244,114,182,0.7) 50%, rgba(250,204,21,0.6) 100%);
              background-size: 200% 200%;
              animation: hmFoilShimmer 2.4s ease infinite;
              opacity: 0.85;
            }

            @keyframes hmFoilShimmer {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }

            /* INFLOW BANKNOTE 1 (Emerald $100) */
            .hm-note-in-1 {
              left: 50%;
              top: 50%;
              animation: hmNoteInflow1 4.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
            }

            @keyframes hmNoteInflow1 {
              0% {
                transform: translate3d(-340px, 320px, 220px) rotateX(42deg) rotateY(-28deg) rotateZ(18deg);
                opacity: 0;
              }
              15% {
                opacity: 1;
              }
              65% {
                transform: translate3d(-60px, 60px, 60px) rotateX(18deg) rotateY(-10deg) rotateZ(6deg);
                opacity: 1;
              }
              90% {
                transform: translate3d(-10px, 10px, -20px) rotateX(4deg) rotateY(-2deg) rotateZ(0deg) scale(0.9);
                opacity: 0.9;
              }
              100% {
                transform: translate3d(0, 0, -80px) rotateX(0deg) scale(0.7);
                opacity: 0;
              }
            }

            /* INFLOW BANKNOTE 2 (Mint $500) */
            .hm-note-in-2 {
              left: 50%;
              top: 50%;
              animation: hmNoteInflow2 4.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite 1.4s;
              opacity: 0;
            }

            @keyframes hmNoteInflow2 {
              0% {
                transform: translate3d(-390px, 260px, 180px) rotateX(36deg) rotateY(-34deg) rotateZ(12deg);
                opacity: 0;
              }
              18% {
                opacity: 1;
              }
              68% {
                transform: translate3d(-80px, 40px, 40px) rotateX(14deg) rotateY(-12deg) rotateZ(4deg);
                opacity: 1;
              }
              92% {
                transform: translate3d(-15px, 5px, -30px) rotateX(2deg) scale(0.88);
                opacity: 0.85;
              }
              100% {
                transform: translate3d(0, 0, -90px) scale(0.65);
                opacity: 0;
              }
            }

            /* INFLOW BANKNOTE 3 (Deep Emerald $1,000) */
            .hm-note-in-3 {
              left: 50%;
              top: 50%;
              animation: hmNoteInflow3 4.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite 2.8s;
              opacity: 0;
            }

            @keyframes hmNoteInflow3 {
              0% {
                transform: translate3d(-300px, 380px, 260px) rotateX(48deg) rotateY(-22deg) rotateZ(24deg);
                opacity: 0;
              }
              15% {
                opacity: 1;
              }
              65% {
                transform: translate3d(-50px, 80px, 80px) rotateX(20deg) rotateY(-8deg) rotateZ(8deg);
                opacity: 1;
              }
              90% {
                transform: translate3d(-5px, 15px, -20px) scale(0.92);
                opacity: 0.9;
              }
              100% {
                transform: translate3d(0, 0, -70px) scale(0.72);
                opacity: 0;
              }
            }

            /* OUTFLOW BANKNOTE 1 (Coral -$120) */
            .hm-note-out-1 {
              left: 50%;
              top: 50%;
              animation: hmNoteOutflow1 4.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite 0.7s;
              opacity: 0;
            }

            @keyframes hmNoteOutflow1 {
              0% {
                transform: translate3d(0, 0, -40px) rotateX(0deg) rotateY(0deg) scale(0.75);
                opacity: 0;
              }
              15% {
                opacity: 1;
                transform: translate3d(30px, -25px, 0px) rotateX(-10deg) rotateY(12deg) rotateZ(-4deg) scale(0.9);
              }
              70% {
                transform: translate3d(180px, -160px, 140px) rotateX(-26deg) rotateY(28deg) rotateZ(-14deg) scale(1.05);
                opacity: 1;
              }
              92% {
                opacity: 0.8;
              }
              100% {
                transform: translate3d(360px, -320px, 280px) rotateX(-42deg) rotateY(40deg) rotateZ(-22deg) scale(0.7);
                opacity: 0;
              }
            }

            /* OUTFLOW BANKNOTE 2 (Amber -$250) */
            .hm-note-out-2 {
              left: 50%;
              top: 50%;
              animation: hmNoteOutflow2 4.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite 2.2s;
              opacity: 0;
            }

            @keyframes hmNoteOutflow2 {
              0% {
                transform: translate3d(-10px, 10px, -50px) scale(0.7);
                opacity: 0;
              }
              18% {
                opacity: 1;
                transform: translate3d(40px, -35px, 20px) rotateX(-12deg) rotateY(16deg) rotateZ(-6deg) scale(0.92);
              }
              72% {
                transform: translate3d(210px, -190px, 160px) rotateX(-28deg) rotateY(32deg) rotateZ(-16deg) scale(1.02);
                opacity: 1;
              }
              94% {
                opacity: 0.85;
              }
              100% {
                transform: translate3d(390px, -360px, 310px) rotateX(-45deg) rotateY(44deg) rotateZ(-26deg) scale(0.65);
                opacity: 0;
              }
            }

            /* VAULT FANNED STACK: 3 Crisp Central Orbit Notes */
            .hm-vault-stack {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 140px;
              height: 72px;
              margin-left: -70px;
              margin-top: -36px;
              transform-style: preserve-3d;
              pointer-events: none;
              animation: hmVaultFloat 6s ease-in-out infinite alternate;
            }

            @keyframes hmVaultFloat {
              0% {
                transform: rotateX(12deg) rotateY(-8deg) rotateZ(-2deg) translate3d(0, -6px, 10px);
              }
              100% {
                transform: rotateX(18deg) rotateY(8deg) rotateZ(3deg) translate3d(0, 6px, 35px);
              }
            }

            .hm-stack-note-1 {
              transform: translate3d(-12px, 8px, -15px) rotateZ(-7deg);
              opacity: 0.7;
            }
            .hm-stack-note-2 {
              transform: translate3d(12px, 4px, -8px) rotateZ(6deg);
              opacity: 0.85;
            }
            .hm-stack-note-3 {
              transform: translate3d(0, 0, 0) rotateZ(0deg);
              opacity: 0.96;
            }

            /* Floating Currency Sparks */
            .hm-sparkle {
              position: absolute;
              font-family: ui-monospace, monospace;
              font-weight: 700;
              pointer-events: none;
              animation: hmSparkleFloat 3.8s ease-in-out infinite;
            }

            @keyframes hmSparkleFloat {
              0% {
                transform: translate3d(0, 0, 0) scale(0.8);
                opacity: 0.2;
              }
              50% {
                transform: translate3d(10px, -24px, 40px) scale(1.15);
                opacity: 0.9;
              }
              100% {
                transform: translate3d(20px, -48px, 0px) scale(0.8);
                opacity: 0.2;
              }
            }

            /* Text & Shimmer Keyframes */
            .hm-shimmer-text {
              background: linear-gradient(90deg, #a7f3d0 0%, #ffffff 50%, #fde68a 100%);
              background-size: 200% auto;
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              animation: hmTextShine 3s linear infinite;
            }

            @keyframes hmTextShine {
              to {
                background-position: 200% center;
              }
            }

            /* Progress Bar Comet */
            .hm-progress-bar-fill {
              animation: hmProgressFill 2.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
            }

            @keyframes hmProgressFill {
              0% { width: 5%; }
              25% { width: 35%; }
              60% { width: 75%; }
              100% { width: 100%; }
            }
          `,
        }}
      />

      {/* Background 3D Scene: Money Notes & Dynamic Cash Flow Stream */}
      <div className="hm-scene-3d" aria-hidden="true">
        {/* Curved Cash Flow Stream Arcs (Inflow Green + Outflow Gold/Rose) */}
        <svg className="hm-stream-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <defs>
            <linearGradient id="hm-inflow-grad" x1="0%" y1="100%" x2="50%" y2="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
              <stop offset="50%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="hm-outflow-grad" x1="50%" y1="50%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#fb7185" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Inflow Arc: Bottom-Left to Center */}
          <path
            d="M 50,950 Q 250,750 500,500"
            fill="none"
            stroke="url(#hm-inflow-grad)"
            strokeWidth="2.5"
            className="hm-stream-inflow"
          />

          {/* Outflow Arc: Center to Top-Right */}
          <path
            d="M 500,500 Q 750,250 950,50"
            fill="none"
            stroke="url(#hm-outflow-grad)"
            strokeWidth="2.5"
            className="hm-stream-outflow"
          />
        </svg>

        {/* Floating Currency Spark Particles */}
        <div className="hm-sparkle text-emerald-400 text-sm" style={{ left: "22%", top: "72%", animationDelay: "0s" }}>+$100</div>
        <div className="hm-sparkle text-emerald-300 text-base" style={{ left: "34%", top: "62%", animationDelay: "1.2s" }}>+€250</div>
        <div className="hm-sparkle text-amber-300 text-xs" style={{ left: "68%", top: "34%", animationDelay: "0.6s" }}>-$50</div>
        <div className="hm-sparkle text-rose-300 text-sm" style={{ left: "78%", top: "24%", animationDelay: "1.8s" }}>-£80</div>
        <div className="hm-sparkle text-amber-400 text-base" style={{ left: "54%", top: "42%", animationDelay: "2.4s" }}>✦</div>
        <div className="hm-sparkle text-emerald-400 text-xs" style={{ left: "42%", top: "52%", animationDelay: "0.9s" }}>₿</div>

        {/* INFLOW NOTE 1: Emerald +$100 */}
        <div className="hm-note-3d hm-note-in-1 -ml-[65px] -mt-[34px] sm:-ml-[77px] sm:-mt-[40px]">
          <svg viewBox="0 0 154 80" className="w-full h-full rounded-md shadow-2xl">
            <rect width="154" height="80" rx="5" fill="#042F2E" stroke="#10B981" strokeWidth="1.5" />
            <rect x="5" y="5" width="144" height="70" rx="3" fill="none" stroke="#059669" strokeWidth="0.8" strokeDasharray="3 2" />
            {/* Corner numbers */}
            <text x="14" y="20" fill="#34D399" fontSize="10" fontFamily="monospace" fontWeight="bold">100</text>
            <text x="140" y="20" fill="#34D399" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">100</text>
            <text x="14" y="68" fill="#34D399" fontSize="10" fontFamily="monospace" fontWeight="bold">100</text>
            <text x="140" y="68" fill="#34D399" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">100</text>
            {/* Center guilloche rosette */}
            <circle cx="77" cy="40" r="16" fill="#064E3B" stroke="#34D399" strokeWidth="1" />
            <text x="77" y="44" fill="#ECFDF5" fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle">+$100</text>
          </svg>
          <div className="hm-note-foil rounded-sm" />
        </div>

        {/* INFLOW NOTE 2: Mint +$500 */}
        <div className="hm-note-3d hm-note-in-2 -ml-[65px] -mt-[34px] sm:-ml-[77px] sm:-mt-[40px]">
          <svg viewBox="0 0 154 80" className="w-full h-full rounded-md shadow-2xl">
            <rect width="154" height="80" rx="5" fill="#064E3B" stroke="#34D399" strokeWidth="1.5" />
            <rect x="5" y="5" width="144" height="70" rx="3" fill="none" stroke="#6EE7B7" strokeWidth="0.8" strokeDasharray="4 2" />
            <text x="14" y="20" fill="#A7F3D0" fontSize="10" fontFamily="monospace" fontWeight="bold">500</text>
            <text x="140" y="20" fill="#A7F3D0" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">500</text>
            <circle cx="77" cy="40" r="16" fill="#042F2E" stroke="#6EE7B7" strokeWidth="1" />
            <text x="77" y="44" fill="#FFFFFF" fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle">+$500</text>
          </svg>
          <div className="hm-note-foil rounded-sm" />
        </div>

        {/* INFLOW NOTE 3: Deep Emerald +$1,000 */}
        <div className="hm-note-3d hm-note-in-3 -ml-[65px] -mt-[34px] sm:-ml-[77px] sm:-mt-[40px]">
          <svg viewBox="0 0 154 80" className="w-full h-full rounded-md shadow-2xl">
            <rect width="154" height="80" rx="5" fill="#022C22" stroke="#059669" strokeWidth="1.5" />
            <rect x="5" y="5" width="144" height="70" rx="3" fill="none" stroke="#34D399" strokeWidth="0.8" />
            <text x="14" y="20" fill="#6EE7B7" fontSize="9" fontFamily="monospace" fontWeight="bold">1K</text>
            <text x="140" y="20" fill="#6EE7B7" fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="end">1K</text>
            <circle cx="77" cy="40" r="16" fill="#064E3B" stroke="#10B981" strokeWidth="1" />
            <text x="77" y="44" fill="#ECFDF5" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">+$1,000</text>
          </svg>
          <div className="hm-note-foil rounded-sm" />
        </div>

        {/* OUTFLOW NOTE 1: Coral -$120 */}
        <div className="hm-note-3d hm-note-out-1 -ml-[65px] -mt-[34px] sm:-ml-[77px] sm:-mt-[40px]">
          <svg viewBox="0 0 154 80" className="w-full h-full rounded-md shadow-2xl">
            <rect width="154" height="80" rx="5" fill="#4C0519" stroke="#FB7185" strokeWidth="1.5" />
            <rect x="5" y="5" width="144" height="70" rx="3" fill="none" stroke="#F43F5E" strokeWidth="0.8" strokeDasharray="3 2" />
            <text x="14" y="20" fill="#FDA4AF" fontSize="10" fontFamily="monospace" fontWeight="bold">120</text>
            <text x="140" y="20" fill="#FDA4AF" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">120</text>
            <circle cx="77" cy="40" r="16" fill="#881337" stroke="#FB7185" strokeWidth="1" />
            <text x="77" y="44" fill="#FFF1F2" fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle">-$120</text>
          </svg>
          <div className="hm-note-foil rounded-sm" />
        </div>

        {/* OUTFLOW NOTE 2: Amber -$250 */}
        <div className="hm-note-3d hm-note-out-2 -ml-[65px] -mt-[34px] sm:-ml-[77px] sm:-mt-[40px]">
          <svg viewBox="0 0 154 80" className="w-full h-full rounded-md shadow-2xl">
            <rect width="154" height="80" rx="5" fill="#451A03" stroke="#F59E0B" strokeWidth="1.5" />
            <rect x="5" y="5" width="144" height="70" rx="3" fill="none" stroke="#FBBF24" strokeWidth="0.8" strokeDasharray="4 2" />
            <text x="14" y="20" fill="#FDE68A" fontSize="10" fontFamily="monospace" fontWeight="bold">250</text>
            <text x="140" y="20" fill="#FDE68A" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">250</text>
            <circle cx="77" cy="40" r="16" fill="#78350F" stroke="#F59E0B" strokeWidth="1" />
            <text x="77" y="44" fill="#FFFBEB" fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle">-$250</text>
          </svg>
          <div className="hm-note-foil rounded-sm" />
        </div>

        {/* VAULT FANNED STACK (Layered 3D crisp notes in center orbit) */}
        <div className="hm-vault-stack">
          {/* Note 1 (Back Left) */}
          <div className="hm-note-3d hm-stack-note-1 inset-0">
            <svg viewBox="0 0 154 80" className="w-full h-full rounded-md">
              <rect width="154" height="80" rx="5" fill="#0F172A" stroke="#475569" strokeWidth="1.2" />
              <circle cx="77" cy="40" r="14" fill="#1E293B" stroke="#64748B" strokeWidth="1" />
              <text x="77" y="44" fill="#94A3B8" fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">TREASURY</text>
            </svg>
          </div>

          {/* Note 2 (Back Right) */}
          <div className="hm-note-3d hm-stack-note-2 inset-0">
            <svg viewBox="0 0 154 80" className="w-full h-full rounded-md">
              <rect width="154" height="80" rx="5" fill="#1E293B" stroke="#D97706" strokeWidth="1.2" />
              <circle cx="77" cy="40" r="14" fill="#0F172A" stroke="#F59E0B" strokeWidth="1" />
              <text x="77" y="44" fill="#FDE68A" fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">$10,000</text>
            </svg>
            <div className="hm-note-foil rounded-sm" />
          </div>

          {/* Note 3 (Front Crisp Note) */}
          <div className="hm-note-3d hm-stack-note-3 inset-0">
            <svg viewBox="0 0 154 80" className="w-full h-full rounded-md">
              <rect width="154" height="80" rx="5" fill="#042F2E" stroke="#10B981" strokeWidth="1.8" />
              <rect x="5" y="5" width="144" height="70" rx="3" fill="none" stroke="#34D399" strokeWidth="0.8" strokeDasharray="3 2" />
              <text x="14" y="20" fill="#34D399" fontSize="10" fontFamily="monospace" fontWeight="bold">HM</text>
              <text x="140" y="20" fill="#34D399" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="end">HM</text>
              <circle cx="77" cy="40" r="16" fill="#064E3B" stroke="#34D399" strokeWidth="1" />
              <text x="77" y="44" fill="#ECFDF5" fontSize="13" fontFamily="monospace" fontWeight="bold" textAnchor="middle">LEDGER</text>
            </svg>
            <div className="hm-note-foil rounded-sm" />
          </div>
        </div>
      </div>

      {/* Top Header Bar: PWA Status Badge & Fast Skip button */}
      <header className="relative w-full max-w-4xl px-6 pt-safe mt-4 sm:mt-6 flex items-center justify-between z-20 pointer-events-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span
            id="hm-splash-mode-label"
            className="text-[11px] font-mono tracking-wide text-emerald-300 font-semibold uppercase"
          >
            Hard Money Treasury
          </span>
        </div>

        <button
          type="button"
          id="hm-splash-skip-btn"
          aria-label="Skip splash screen"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 backdrop-blur-md text-xs font-medium text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          <span>Skip</span>
          <X size={13} />
        </button>
      </header>

      {/* Center Core: Treasury Vault Emblem & Brand Identity */}
      <div className="relative flex flex-col items-center text-center z-20 my-auto px-4 pointer-events-none">
        {/* Pulsing Treasury Vault Shield */}
        <div className="relative mb-6 flex items-center justify-center">
          {/* Concentric radar pulse rings */}
          <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-emerald-500/25 animate-ping opacity-60" />
          <div className="absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full border border-amber-500/15 animate-pulse" />

          {/* Central Holographic Emblem Base */}
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-emerald-600/30 via-slate-900 to-amber-500/20 border-2 border-emerald-400/50 shadow-2xl shadow-emerald-500/30 flex items-center justify-center backdrop-blur-xl">
            <Landmark className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]" />

            {/* Sparkle badge */}
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-400 border border-amber-200 flex items-center justify-center shadow-lg shadow-amber-500/50 animate-bounce">
              <Sparkles size={13} className="text-amber-950" />
            </div>
          </div>
        </div>

        {/* Brand Title with Metallic Shimmer */}
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[0.24em] uppercase hm-shimmer-text drop-shadow-sm font-sans">
            Hard Money
          </h1>
          <p className="text-[11px] sm:text-xs font-mono tracking-[0.16em] uppercase text-emerald-400/90 font-medium">
            Personal Treasury & Ledger
          </p>
        </div>

        {/* Dynamic Status Capsule */}
        <div className="mt-7 flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-inner">
          <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
          <span
            id="hm-splash-status"
            className="text-xs font-mono text-slate-300 transition-all duration-300"
          >
            Counting cash flows & reserves...
          </span>
        </div>
      </div>

      {/* Bottom Footer: Minimalist Stream Progress Bar & Hint */}
      <footer className="relative w-full max-w-xs px-6 pb-safe mb-6 sm:mb-8 flex flex-col items-center gap-3 z-20 pointer-events-none">
        {/* Progress Bar with Glowing Comet Head */}
        <div className="w-full h-1.5 bg-slate-800/80 rounded-full overflow-hidden border border-white/5 relative">
          <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 rounded-full relative shadow-[0_0_10px_rgba(52,211,153,0.8)] hm-progress-bar-fill">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full blur-[1px]" />
          </div>
        </div>

        <p className="text-[11px] text-slate-400/70 font-mono tracking-wider">
          Tap anywhere to continue
        </p>
      </footer>
    </div>
  );
}

