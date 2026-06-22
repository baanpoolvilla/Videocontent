"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Home, Package, BrainCircuit, Clapperboard, FileText, Mic2,
  Film, ShieldCheck, Eye, CheckCircle2, Upload, Calendar, BarChart3,
  Link2, LogOut, Zap, Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const quickNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/",          label: "หน้าแรก",   icon: Home },
];

type GroupItem = { href: string; label: string; icon: LucideIcon; step: string };
type Group     = { num: string; label: string; color: string; items: GroupItem[] };

const groups: Group[] = [
  {
    num: "1", label: "อัปโหลด & วิเคราะห์", color: "#22D499",
    items: [
      { href: "/products", label: "อัปโหลดสินค้า",  icon: Package,      step: "02" },
      { href: "/analysis", label: "ผลวิเคราะห์ AI", icon: BrainCircuit, step: "03" },
    ],
  },
  {
    num: "2", label: "AI สร้างคอนเทนต์", color: "#00FFD4",
    items: [
      { href: "/generate", label: "เทมเพลต / คอนเซ็ปต์", icon: Clapperboard, step: "04" },
      { href: "/scripts",  label: "แก้ไข Script",          icon: FileText,    step: "05" },
      { href: "/caption",  label: "Caption · Hashtag · เสียง", icon: Mic2,    step: "06" },
    ],
  },
  {
    num: "3", label: "เรนเดอร์ & ตรวจสอบ", color: "#FFB02E",
    items: [
      { href: "/render-queue", label: "คิวเรนเดอร์",       icon: Film,       step: "07" },
      { href: "/compliance",   label: "ตรวจสอบมาตรฐาน",   icon: ShieldCheck, step: "08" },
    ],
  },
  {
    num: "4", label: "พรีวิว & ตั้งเวลา", color: "#4D7FFF",
    items: [
      { href: "/preview",     label: "พรีวิวเวอร์ชัน A–E", icon: Eye,          step: "09" },
      { href: "/approval",    label: "อนุมัติ",             icon: CheckCircle2, step: "10" },
      { href: "/manual-post", label: "โพสต์เอง",            icon: Upload,       step: "10b" },
      { href: "/schedule",    label: "Schedule",            icon: Calendar,     step: "11" },
    ],
  },
  {
    num: "5", label: "ผลตอบรับ", color: "#FF6FB7",
    items: [
      { href: "/analytics", label: "ผลตอบรับหลังโพสต์", icon: BarChart3, step: "12" },
    ],
  },
  {
    num: "–", label: "ระบบ", color: "#8890AE",
    items: [
      { href: "/accounts",      label: "เชื่อมต่อบัญชี / Token", icon: Link2,       step: "13" },
      { href: "/brand-profile", label: "Brand Profile",            icon: Zap,         step: "14" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar" style={{ position: "relative", overflow: "hidden" }}>

      {/* Ambient background orbs */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: -50, left: -40, width: 200, height: 200, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,255,212,.07) 0%, transparent 70%)",
        }} />
        <div style={{
          position: "absolute", bottom: 60, right: -40, width: 150, height: 150, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(77,127,255,.06) 0%, transparent 70%)",
        }} />
      </div>

      {/* Brand */}
      <div style={{ padding: "20px 16px 14px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          {/* Brand mark with pulsing glow */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              position: "absolute", inset: -5, borderRadius: 13,
              background: "radial-gradient(circle, rgba(0,255,212,.35) 0%, transparent 70%)",
              animation: "sb-pulse 2.4s ease-in-out infinite",
            }} />
            <div className="brand-mark" style={{ position: "relative" }}>
              <Zap size={16} strokeWidth={3} />
            </div>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-.01em" }}>
              Content Studio
            </p>
            <p style={{ margin: 0, fontSize: 10, color: "var(--faint)" }}>AI Pipeline v2.0</p>
          </div>
        </div>

        {/* CTA with shimmer sweep */}
        <button className="sidebar-cta" onClick={() => router.push("/generate")}
          style={{ position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", top: 0, left: "-70%", width: "50%", height: "100%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent)",
            animation: "sb-shimmer 2.8s ease-in-out infinite",
            pointerEvents: "none",
          }} />
          <Plus size={14} strokeWidth={3} />
          สร้างคลิปใหม่
        </button>
      </div>

      {/* Scrollable nav */}
      <nav className="sidebar-inner nav-scroll" style={{ position: "relative", zIndex: 1 }}>

        {/* Quick nav */}
        <div style={{ padding: "0 8px", marginBottom: 6 }}>
          {quickNav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href}
                className={`qnav-item${active ? " active" : ""}`}
                style={{ position: "relative", overflow: "hidden" }}
              >
                {active && (
                  <>
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                      background: "var(--teal)", boxShadow: "2px 0 8px rgba(0,255,212,.6)",
                      borderRadius: "0 2px 2px 0",
                    }} />
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(90deg, rgba(0,255,212,.1), transparent 70%)",
                      pointerEvents: "none",
                    }} />
                  </>
                )}
                <span className="qnav-icon" style={{ position: "relative" }}>
                  <Icon size={13} strokeWidth={2} />
                </span>
                <span style={{ position: "relative" }}>{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="sdiv" />

        {/* Workflow groups */}
        {groups.map((group) => (
          <div key={group.num} style={{ marginBottom: 5 }}>

            {/* Group header — vertical color bar instead of dot */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px 4px" }}>
              <div style={{
                width: 3, height: 14, borderRadius: 2, flexShrink: 0,
                background: group.color,
                boxShadow: `0 0 7px ${group.color}99`,
              }} />
              <span style={{
                fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: ".07em", color: "var(--faint)", flex: 1,
              }}>{group.num !== "–" ? `${group.num}. ` : ""}{group.label}</span>
            </div>

            <div style={{ padding: "0 6px 2px 20px" }}>
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    className={`nav-item${active ? " active" : ""}`}
                    style={{ position: "relative", overflow: "hidden" }}
                  >
                    {active && (
                      <>
                        {/* Left color bar */}
                        <div style={{
                          position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                          background: `linear-gradient(180deg, ${group.color}, ${group.color}aa)`,
                          boxShadow: `2px 0 10px ${group.color}77`,
                          borderRadius: "0 2px 2px 0",
                        }} />
                        {/* Gradient glow background */}
                        <div style={{
                          position: "absolute", inset: 0,
                          background: `linear-gradient(90deg, ${group.color}14, transparent 65%)`,
                          borderRadius: "inherit", pointerEvents: "none",
                        }} />
                      </>
                    )}

                    {/* Step badge */}
                    <span style={{
                      width: 22, height: 22, borderRadius: 6,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, fontSize: 9, fontWeight: 800, position: "relative",
                      background: active ? `${group.color}22` : "var(--glass2)",
                      color: active ? group.color : "var(--faint)",
                      border: `1px solid ${active ? group.color + "44" : "transparent"}`,
                      boxShadow: active ? `0 0 8px ${group.color}33` : "none",
                      transition: "all .2s",
                    }}>{item.step}</span>

                    <span style={{
                      flex: 1, position: "relative",
                      fontWeight: active ? 700 : 600,
                    }}>{item.label}</span>

                    {/* Pulsing dot for active item */}
                    {active && (
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                        background: group.color,
                        boxShadow: `0 0 6px ${group.color}`,
                        animation: "sb-pulse 2s ease-in-out infinite",
                        position: "relative",
                      }} />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Usage bar */}
      <div style={{ padding: "0 12px 10px", position: "relative", zIndex: 1 }}>
        <div style={{
          background: "var(--glass)", border: "1px solid var(--gb)",
          borderRadius: 12, padding: "10px 12px", fontSize: 11.5, color: "var(--dim)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, alignItems: "center" }}>
            <span>⚡ เรนเดอร์วันนี้</span>
            <b style={{ color: "var(--teal)" }}>62%</b>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,.07)", borderRadius: 2, overflow: "hidden" }}>
            <div className="rbar-fill" style={{ width: "62%", height: "100%" }} />
          </div>
        </div>
      </div>

      {/* Logout */}
      <div style={{ padding: "8px 6px 14px", borderTop: "1px solid var(--gb)", position: "relative", zIndex: 1 }}>
        <button
          onClick={() => { localStorage.clear(); router.push("/login"); }}
          className="nav-item"
          style={{ width: "100%", border: "none", background: "none", cursor: "pointer" }}
        >
          <span style={{
            width: 22, height: 22, borderRadius: 6, display: "flex",
            alignItems: "center", justifyContent: "center", background: "var(--glass2)", flexShrink: 0,
          }}><LogOut size={11} strokeWidth={2} /></span>
          <span style={{ flex: 1, textAlign: "left" }}>ออกจากระบบ</span>
        </button>
      </div>

      <style>{`
        @keyframes sb-pulse {
          0%, 100% { opacity: .65; transform: scale(1); }
          50%       { opacity: 1;  transform: scale(1.3); }
        }
        @keyframes sb-shimmer {
          0%        { left: -70%; }
          60%, 100% { left: 130%; }
        }
      `}</style>
    </aside>
  );
}
