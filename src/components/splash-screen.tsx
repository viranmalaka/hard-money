"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Landmark, Sparkles, X, ShieldCheck } from "lucide-react";

interface Banknote {
  id: number;
  type: "inflow" | "outflow" | "vault";
  denomination: string;
  symbol: string;
  // 3D world position
  x: number;
  y: number;
  z: number;
  // Velocity
  vx: number;
  vy: number;
  vz: number;
  // Euler rotation angles (radians)
  rotX: number;
  rotY: number;
  rotZ: number;
  // Rotational velocities
  vRotX: number;
  vRotY: number;
  vRotZ: number;
  // Aerodynamic flutter
  flutterPhase: number;
  flutterSpeed: number;
  // Life and appearance
  life: number; // 0 to 1
  maxLife: number;
  scale: number;
  width: number;
  height: number;
  // Trail history
  trail: { x: number; y: number; alpha: number }[];
}

interface SparkParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  char: string;
  color: string;
  life: number;
}

const CURRENCIES = [
  { symbol: "$", amounts: ["100", "500", "50", "20"] },
  { symbol: "€", amounts: ["100", "200", "50"] },
  { symbol: "£", amounts: ["50", "100", "20"] },
  { symbol: "₿", amounts: ["1", "0.5"] },
  { symbol: "Rs", amounts: ["5,000", "10,000", "2,000"] },
];

export function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const [isPwa, setIsPwa] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const notesRef = useRef<Banknote[]>([]);
  const particlesRef = useRef<SparkParticle[]>([]);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const startTimeRef = useRef<number>(0);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const statusMessages = [
    "Opening personal treasury...",
    "Streaming incoming & outgoing cash flows...",
    "Balancing double-entry ledger...",
    "Personal treasury verified & ready.",
  ];

  const handleDismiss = useCallback(() => {
    if (animatingOut) return;
    setAnimatingOut(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("hardmoney_splash_shown", "true");
    }
    exitTimeoutRef.current = setTimeout(() => {
      setVisible(false);
      setAnimatingOut(false);
    }, 450);
  }, [animatingOut]);

  // Check initial startup requirements
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;

    // Detect if running in automated test harness
    const isAutomatedTest =
      Boolean(window.navigator.webdriver) ||
      window.location.search.includes("nosplash") ||
      window.location.search.includes("e2e=true");

    if (isAutomatedTest) {
      return;
    }

    const nav = window.navigator as unknown as { standalone?: boolean };
    const pwaActive = Boolean(
      nav?.standalone ||
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches,
    );
    setIsPwa(pwaActive);

    const hasShownInSession = sessionStorage.getItem("hardmoney_splash_shown");
    const forceShow = window.location.search.includes("splash=1");

    // Show on PWA launch or first visit of browser session
    if (pwaActive || !hasShownInSession || forceShow) {
      setVisible(true);
      startTimeRef.current = Date.now();
    }

    const handleCustomTrigger = () => {
      setVisible(true);
      setAnimatingOut(false);
      setProgress(0);
      setStatusIndex(0);
      startTimeRef.current = Date.now();
    };

    window.addEventListener("hardmoney_trigger_splash", handleCustomTrigger);
    return () => {
      window.removeEventListener(
        "hardmoney_trigger_splash",
        handleCustomTrigger,
      );
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
  }, []);

  // Progress and status ticker loop
  useEffect(() => {
    if (!visible || animatingOut) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const minDuration = 2200; // minimum display time for smooth experience
      const pct = Math.min(100, Math.round((elapsed / minDuration) * 100));
      setProgress(pct);

      if (elapsed < 600) {
        setStatusIndex(0);
      } else if (elapsed < 1300) {
        setStatusIndex(1);
      } else if (elapsed < 1900) {
        setStatusIndex(2);
      } else {
        setStatusIndex(3);
      }

      if (elapsed >= minDuration + 250) {
        handleDismiss();
      }
    }, 40);

    return () => clearInterval(interval);
  }, [visible, animatingOut, handleDismiss]);

  // Canvas Money Notes & Particles Engine
  useEffect(() => {
    if (!visible || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const handleResize = () => {
      if (!canvasRef.current) return;
      width = window.innerWidth;
      height = window.innerHeight;
      canvasRef.current.width = width * dpr;
      canvasRef.current.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    window.addEventListener("resize", handleResize);

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const nx = (clientX / width - 0.5) * 2;
      const ny = (clientY / height - 0.5) * 2;
      pointerRef.current.targetX = nx * 0.45;
      pointerRef.current.targetY = ny * 0.45;
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("touchmove", handlePointerMove, { passive: true });

    // Seed banknotes
    const createNote = (
      type: "inflow" | "outflow" | "vault",
      id: number,
    ): Banknote => {
      const cur = CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)];
      const amt = cur.amounts[Math.floor(Math.random() * cur.amounts.length)];
      const prefix = type === "inflow" ? "+" : type === "outflow" ? "-" : "";

      const noteW = width < 640 ? 110 : 135;
      const noteH = noteW * 0.52;

      let x = 0;
      let y = 0;
      let z = 0;
      let vx = 0;
      let vy = 0;
      let vz = 0;

      if (type === "inflow") {
        // Starts bottom-left offscreen, swoops upwards toward center
        x = -width * 0.45 - Math.random() * 120;
        y = height * 0.35 + Math.random() * 180;
        z = 180 + Math.random() * 220;
        vx = 3.2 + Math.random() * 2.2;
        vy = -2.4 - Math.random() * 1.8;
        vz = -2.0 - Math.random() * 1.5;
      } else if (type === "outflow") {
        // Starts near center, swoops outwards toward top-right into distance
        x = (Math.random() - 0.5) * 60;
        y = (Math.random() - 0.5) * 60;
        z = -30 + Math.random() * 50;
        vx = 2.8 + Math.random() * 2.5;
        vy = -1.8 - Math.random() * 2.2;
        vz = 2.5 + Math.random() * 2.0;
      } else {
        // Central hovering stack / orbit
        x = (Math.random() - 0.5) * 140;
        y = (Math.random() - 0.5) * 100;
        z = -40 + Math.random() * 80;
        vx = (Math.random() - 0.5) * 0.6;
        vy = (Math.random() - 0.5) * 0.6;
        vz = (Math.random() - 0.5) * 0.4;
      }

      return {
        id,
        type,
        denomination: `${prefix}${cur.symbol}${amt}`,
        symbol: cur.symbol,
        x,
        y,
        z,
        vx,
        vy,
        vz,
        rotX: (Math.random() - 0.5) * 0.6,
        rotY: (Math.random() - 0.5) * 0.8,
        rotZ: (Math.random() - 0.5) * 0.6,
        vRotX: (Math.random() - 0.5) * 0.035,
        vRotY: (Math.random() - 0.5) * 0.045,
        vRotZ: (Math.random() - 0.5) * 0.025,
        flutterPhase: Math.random() * Math.PI * 2,
        flutterSpeed: 0.08 + Math.random() * 0.06,
        life: 0,
        maxLife: type === "vault" ? 500 : 180 + Math.random() * 80,
        scale: 1,
        width: noteW,
        height: noteH,
        trail: [],
      };
    };

    // Initialize initial batch
    const initialNotes: Banknote[] = [];
    for (let i = 0; i < 4; i++) initialNotes.push(createNote("inflow", i));
    for (let i = 4; i < 8; i++) initialNotes.push(createNote("outflow", i));
    for (let i = 8; i < 11; i++) initialNotes.push(createNote("vault", i));
    notesRef.current = initialNotes;

    // Initialize floating currency sparks
    const sparkChars = ["+", "$", "€", "£", "₿", "•", "✦"];
    const initialParticles: SparkParticle[] = [];
    for (let i = 0; i < 45; i++) {
      initialParticles.push({
        x: (Math.random() - 0.5) * width * 1.2,
        y: (Math.random() - 0.5) * height * 1.2,
        z: (Math.random() - 0.5) * 400,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -0.4 - Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 0.5,
        size: 9 + Math.random() * 8,
        alpha: Math.random() * 0.7,
        maxAlpha: 0.35 + Math.random() * 0.45,
        char: sparkChars[Math.floor(Math.random() * sparkChars.length)],
        color: Math.random() > 0.45 ? "#10B981" : "#F59E0B",
        life: Math.random() * 200,
      });
    }
    particlesRef.current = initialParticles;

    let nextNoteId = 20;
    const focalLength = 480;
    const cx = width / 2;
    const cy = height / 2;

    // 3D rotation projection helper
    const project3D = (
      px: number,
      py: number,
      pz: number,
      rotX: number,
      rotY: number,
      rotZ: number,
      worldX: number,
      worldY: number,
      worldZ: number,
    ) => {
      // Rotate around X
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y1 = py * cosX - pz * sinX;
      const z1 = py * sinX + pz * cosX;

      // Rotate around Y
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x2 = px * cosY + z1 * sinY;
      const z2 = -px * sinY + z1 * cosY;

      // Rotate around Z
      const cosZ = Math.cos(rotZ);
      const sinZ = Math.sin(rotZ);
      const x3 = x2 * cosZ - y1 * sinZ;
      const y3 = x2 * sinZ + y1 * cosZ;

      // Translate to world position
      const finalX = worldX + x3;
      const finalY = worldY + y3;
      const finalZ = worldZ + z2;

      // Perspective projection
      const depth = focalLength + finalZ;
      const scale = depth > 20 ? focalLength / depth : 0.001;

      return {
        screenX: cx + finalX * scale,
        screenY: cy + finalY * scale,
        scale,
        depth: finalZ,
      };
    };

    // Draw individual stylized 3D banknote
    const drawBanknote = (note: Banknote) => {
      const halfW = note.width / 2;
      const halfH = note.height / 2;

      // Dynamic paper flutter wave
      const flutterOffset = Math.sin(note.flutterPhase) * 6;

      // Compute 4 corner screen vertices
      const pTL = project3D(
        -halfW,
        -halfH,
        flutterOffset,
        note.rotX,
        note.rotY,
        note.rotZ,
        note.x,
        note.y,
        note.z,
      );
      const pTR = project3D(
        halfW,
        -halfH,
        -flutterOffset,
        note.rotX,
        note.rotY,
        note.rotZ,
        note.x,
        note.y,
        note.z,
      );
      const pBR = project3D(
        halfW,
        halfH,
        flutterOffset,
        note.rotX,
        note.rotY,
        note.rotZ,
        note.x,
        note.y,
        note.z,
      );
      const pBL = project3D(
        -halfW,
        halfH,
        -flutterOffset,
        note.rotX,
        note.rotY,
        note.rotZ,
        note.x,
        note.y,
        note.z,
      );

      const avgScale = (pTL.scale + pTR.scale + pBR.scale + pBL.scale) / 4;
      if (avgScale <= 0.05) return;

      // Check orientation / face normal
      const v1x = pTR.screenX - pTL.screenX;
      const v1y = pTR.screenY - pTL.screenY;
      const v2x = pBL.screenX - pTL.screenX;
      const v2y = pBL.screenY - pTL.screenY;
      const crossZ = v1x * v2y - v1y * v2x;
      const isFrontFace = crossZ > 0;

      // Soft dynamic drop shadow
      ctx.save();
      const shadowDist = 18 * avgScale;
      ctx.beginPath();
      ctx.moveTo(pTL.screenX + shadowDist * 0.3, pTL.screenY + shadowDist);
      ctx.lineTo(pTR.screenX + shadowDist * 0.3, pTR.screenY + shadowDist);
      ctx.lineTo(pBR.screenX + shadowDist * 0.3, pBR.screenY + shadowDist);
      ctx.lineTo(pBL.screenX + shadowDist * 0.3, pBL.screenY + shadowDist);
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      ctx.filter = `blur(${Math.max(4, 10 * avgScale)}px)`;
      ctx.fill();
      ctx.restore();

      // Draw Banknote Body Polygon
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pTL.screenX, pTL.screenY);
      ctx.lineTo(pTR.screenX, pTR.screenY);
      ctx.lineTo(pBR.screenX, pBR.screenY);
      ctx.lineTo(pBL.screenX, pBL.screenY);
      ctx.closePath();

      // Dynamic color theme
      let gradStart = "#064E3B";
      let gradEnd = "#022C22";
      let borderColor = "rgba(52, 211, 153, 0.85)";
      let textColor = "#A7F3D0";
      let auraColor = "rgba(16, 185, 129, 0.25)";

      if (note.type === "outflow") {
        gradStart = "#881337";
        gradEnd = "#4C0519";
        borderColor = "rgba(251, 113, 133, 0.85)";
        textColor = "#FECDD3";
        auraColor = "rgba(244, 63, 94, 0.25)";
      } else if (note.type === "vault") {
        gradStart = "#1E293B";
        gradEnd = "#0F172A";
        borderColor = "rgba(245, 158, 11, 0.85)";
        textColor = "#FEF3C7";
        auraColor = "rgba(245, 158, 11, 0.25)";
      }

      // Linear gradient across banknote surface
      const noteGrad = ctx.createLinearGradient(
        pTL.screenX,
        pTL.screenY,
        pBR.screenX,
        pBR.screenY,
      );
      noteGrad.addColorStop(0, gradStart);
      noteGrad.addColorStop(1, gradEnd);

      ctx.fillStyle = noteGrad;
      ctx.globalAlpha =
        Math.min(1, Math.max(0, note.life / 20)) *
        (1 - Math.max(0, (note.life - (note.maxLife - 25)) / 25));
      ctx.fill();

      // Crisp Banknote Guilloche Border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = Math.max(1, 1.8 * avgScale);
      ctx.stroke();

      // Inner ornamental security hairline
      ctx.save();
      ctx.clip();

      // Iridescent Holographic Security Foil Band
      const foilShift = Math.sin(note.rotY * 2 + note.flutterPhase) * 0.5 + 0.5;
      const foilX =
        pTL.screenX + (pTR.screenX - pTL.screenX) * (0.65 + foilShift * 0.1);
      const foilY =
        pTL.screenY + (pTR.screenY - pTL.screenY) * (0.65 + foilShift * 0.1);
      const foilGrad = ctx.createLinearGradient(
        foilX - 10,
        foilY,
        foilX + 10,
        foilY,
      );
      foilGrad.addColorStop(0, "rgba(56, 189, 248, 0.4)");
      foilGrad.addColorStop(0.5, "rgba(244, 114, 182, 0.6)");
      foilGrad.addColorStop(1, "rgba(250, 204, 21, 0.4)");

      ctx.fillStyle = foilGrad;
      ctx.fillRect(
        foilX - 7 * avgScale,
        pTL.screenY - 20,
        14 * avgScale,
        pBL.screenY - pTL.screenY + 40,
      );

      // Center Rosette & Denomination Typography
      const midX = (pTL.screenX + pTR.screenX + pBR.screenX + pBL.screenX) / 4;
      const midY = (pTL.screenY + pTR.screenY + pBR.screenY + pBL.screenY) / 4;

      // Central Guilloche Medallion
      ctx.beginPath();
      ctx.arc(midX, midY, Math.max(4, 15 * avgScale), 0, Math.PI * 2);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1 * avgScale;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(midX, midY, Math.max(3, 11 * avgScale), 0, Math.PI * 2);
      ctx.fillStyle = auraColor;
      ctx.fill();

      // Currency Denomination Text
      ctx.fillStyle = textColor;
      ctx.font = `bold ${Math.max(8, Math.round(11 * avgScale))}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (isFrontFace) {
        ctx.fillText(note.denomination, midX, midY);
        // Small corner badge
        ctx.font = `${Math.max(6, Math.round(7 * avgScale))}px ui-monospace, monospace`;
        ctx.fillText(
          note.symbol,
          pTL.screenX + (pTR.screenX - pTL.screenX) * 0.18,
          pTL.screenY + (pBL.screenY - pTL.screenY) * 0.3,
        );
      } else {
        // Back of note: Hard Money Treasury Watermark
        ctx.fillText("HARD MONEY", midX, midY);
      }

      ctx.restore();
      ctx.restore();
    };

    // Main animation loop
    const render = () => {
      // Parallax smooth interpolation
      pointerRef.current.x +=
        (pointerRef.current.targetX - pointerRef.current.x) * 0.06;
      pointerRef.current.y +=
        (pointerRef.current.targetY - pointerRef.current.y) * 0.06;

      ctx.clearRect(0, 0, width, height);

      // Ambient radial luxury background
      const bgGrad = ctx.createRadialGradient(
        cx,
        cy,
        40,
        cx,
        cy,
        Math.max(width, height) * 0.7,
      );
      bgGrad.addColorStop(0, "rgba(16, 185, 129, 0.09)");
      bgGrad.addColorStop(0.5, "rgba(11, 17, 30, 0.75)");
      bgGrad.addColorStop(1, "rgba(7, 11, 19, 0.98)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw subtle curved flow lines (Cash Inflow & Outflow Paths)
      ctx.save();
      ctx.lineWidth = 1.5;

      // Inflow Green Stream Arc
      ctx.beginPath();
      ctx.moveTo(-60, height * 0.85);
      ctx.bezierCurveTo(
        width * 0.2,
        height * 0.75,
        width * 0.35,
        height * 0.6,
        cx,
        cy,
      );
      const inStreamGrad = ctx.createLinearGradient(0, height * 0.85, cx, cy);
      inStreamGrad.addColorStop(0, "rgba(16, 185, 129, 0)");
      inStreamGrad.addColorStop(0.6, "rgba(16, 185, 129, 0.28)");
      inStreamGrad.addColorStop(1, "rgba(52, 211, 153, 0.5)");
      ctx.strokeStyle = inStreamGrad;
      ctx.stroke();

      // Outflow Amber/Rose Stream Arc
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(
        width * 0.65,
        height * 0.4,
        width * 0.8,
        height * 0.25,
        width + 60,
        height * 0.15,
      );
      const outStreamGrad = ctx.createLinearGradient(
        cx,
        cy,
        width,
        height * 0.15,
      );
      outStreamGrad.addColorStop(0, "rgba(245, 158, 11, 0.5)");
      outStreamGrad.addColorStop(0.5, "rgba(244, 63, 94, 0.28)");
      outStreamGrad.addColorStop(1, "rgba(244, 63, 94, 0)");
      ctx.strokeStyle = outStreamGrad;
      ctx.stroke();
      ctx.restore();

      // Update and draw floating currency dust particles
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.life += 1;

        if (p.y < -height * 0.6) {
          p.y = height * 0.6;
          p.x = (Math.random() - 0.5) * width;
        }

        const depth = focalLength + p.z;
        if (depth > 20) {
          const pScale = focalLength / depth;
          const sx = cx + (p.x + pointerRef.current.x * 60) * pScale;
          const sy = cy + (p.y + pointerRef.current.y * 60) * pScale;
          const alpha = Math.sin((p.life / 60) * Math.PI) * p.maxAlpha;

          if (alpha > 0.02) {
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
            ctx.font = `${Math.max(7, Math.round(p.size * pScale))}px ui-monospace, monospace`;
            ctx.textAlign = "center";
            ctx.fillText(p.char, sx, sy);
            ctx.restore();
          }
        }
      }

      // Update banknotes physics
      const notes = notesRef.current;
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        note.life += 1;
        note.x += note.vx + pointerRef.current.x * 0.8;
        note.y += note.vy + pointerRef.current.y * 0.8;
        note.z += note.vz;

        note.rotX += note.vRotX;
        note.rotY += note.vRotY;
        note.rotZ += note.vRotZ;
        note.flutterPhase += note.flutterSpeed;

        // Respawn when note reaches end of life or flies out of frame
        if (
          note.life > note.maxLife ||
          (note.type === "outflow" && note.z > 350)
        ) {
          const nextType: "inflow" | "outflow" | "vault" =
            Math.random() < 0.45
              ? "inflow"
              : Math.random() < 0.8
                ? "outflow"
                : "vault";
          notes[i] = createNote(nextType, nextNoteId++);
        }
      }

      // Sort notes by depth (Z-ordering) for correct 3D perspective layering
      notes.sort((a, b) => b.z - a.z);

      // Render each note
      for (let i = 0; i < notes.length; i++) {
        drawBanknote(notes[i]);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchmove", handlePointerMove);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [visible]);

  if (!mounted || !visible) {
    return null;
  }

  return (
    <div
      data-testid="pwa-splash-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Hard Money Application Loading"
      onClick={handleDismiss}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between select-none overflow-hidden transition-all duration-400 ease-out cursor-pointer ${
        animatingOut
          ? "opacity-0 scale-105 blur-md pointer-events-none"
          : "opacity-100 scale-100 blur-none"
      } bg-[#070B13] text-[#F1F5F9]`}
    >
      {/* Dynamic 3D Banknote & Particle Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Top Header Bar: PWA Badge & Skip button */}
      <header className="relative w-full max-w-4xl px-6 pt-safe mt-4 sm:mt-6 flex items-center justify-between z-10 pointer-events-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-mono tracking-wide text-emerald-300 font-semibold uppercase">
            {isPwa ? "PWA Standalone Mode" : "Local-First Treasury"}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          data-testid="splash-skip-btn"
          aria-label="Skip splash screen"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 backdrop-blur-md text-xs font-medium text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          <span>Skip</span>
          <X size={13} />
        </button>
      </header>

      {/* Center Core: Treasury Emblem & Luxury Brand Identity */}
      <div className="relative flex flex-col items-center text-center z-10 my-auto px-4 pointer-events-none">
        {/* Pulsing Treasury Vault Shield */}
        <div className="relative mb-6 flex items-center justify-center">
          {/* Outer glowing radar ripple rings */}
          <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-emerald-500/25 animate-ping opacity-75" />
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
          <h1
            data-testid="splash-brand-title"
            className="text-2xl sm:text-3xl font-extrabold tracking-[0.22em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-white to-amber-200 drop-shadow-sm font-sans"
          >
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
            data-testid="splash-status-text"
            className="text-xs font-mono text-slate-300 transition-all duration-300"
          >
            {statusMessages[statusIndex]}
          </span>
        </div>
      </div>

      {/* Bottom Footer: Minimalist Stream Progress Bar & Hint */}
      <footer className="relative w-full max-w-xs px-6 pb-safe mb-6 sm:mb-8 flex flex-col items-center gap-3 z-10 pointer-events-none">
        {/* Progress Bar with Glowing Comet Head */}
        <div className="w-full h-1.5 bg-slate-800/80 rounded-full overflow-hidden border border-white/5 relative">
          <div
            data-testid="splash-progress-bar"
            style={{ width: `${progress}%` }}
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 rounded-full transition-all duration-150 ease-out relative shadow-[0_0_10px_rgba(52,211,153,0.8)]"
          >
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
