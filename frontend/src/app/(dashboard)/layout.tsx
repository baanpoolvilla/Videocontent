"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  /* Running-light strip styles shared across all 4 edges */
  const frameBase: React.CSSProperties = { position: "fixed", pointerEvents: "none", zIndex: 9999 };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
      <div className="bg-canvas">
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="orb orb3" />
      </div>

      {/* ── 4-edge viewport running-light frame ── */}
      {/* Top */}
      <div style={{ ...frameBase, top: 0, left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg, transparent 0%, #22D499 20%, #00FFD4 38%, #4D7FFF 55%, transparent 75%)",
        backgroundSize: "250% 100%", animation: "frame-h 4s linear infinite" }} />
      {/* Right */}
      <div style={{ ...frameBase, top: 0, right: 0, bottom: 0, width: 2,
        background: "linear-gradient(180deg, transparent 0%, #4D7FFF 25%, #A855F7 50%, #FF6FB7 70%, transparent 90%)",
        backgroundSize: "100% 250%", animation: "frame-v 5s linear infinite" }} />
      {/* Bottom */}
      <div style={{ ...frameBase, bottom: 0, left: 0, right: 0, height: 2,
        background: "linear-gradient(270deg, transparent 0%, #FF6FB7 20%, #A855F7 40%, #4D7FFF 58%, transparent 78%)",
        backgroundSize: "250% 100%", animation: "frame-h 4.5s linear infinite" }} />
      {/* Left */}
      <div style={{ ...frameBase, top: 0, left: 0, bottom: 0, width: 2,
        background: "linear-gradient(0deg, transparent 0%, #22D499 25%, #00FFD4 50%, #4D7FFF 70%, transparent 90%)",
        backgroundSize: "100% 250%", animation: "frame-v 5.5s linear infinite reverse" }} />

      <Sidebar />
      <main style={{ flex: 1, height: "100%", overflowY: "auto", position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
        {children}
        {/* Bottom ambient glow — fades the page bottom nicely on short pages */}
        <div style={{
          position: "fixed", bottom: 2, left: 260, right: 2,
          height: 180, pointerEvents: "none", zIndex: 0,
          background: "linear-gradient(0deg, rgba(0,255,212,.03) 0%, rgba(77,127,255,.02) 40%, transparent 100%)",
        }} />
      </main>
    </div>
  );
}
