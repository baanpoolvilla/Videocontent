"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Home, Package, BrainCircuit, FileText, Mic2,
  Film, Eye, CheckCircle2, Calendar, BarChart3,
  Link2, LogOut, Sparkles, Plus, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const quickNav = [
  { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { href: "/",          label: "หน้าแรก",    icon: Home },
];

type GroupItem = { href: string; label: string; icon: LucideIcon; step: string };
type Group     = { num: number; label: string; color: string; items: GroupItem[] };

const groups: Group[] = [
  {
    num: 1, label: "อัปโหลด & วิเคราะห์", color: "#00FFD4",
    items: [
      { href: "/products", label: "อัปโหลดสินค้า",  icon: Package,      step: "02" },
      { href: "/analysis", label: "ผลวิเคราะห์ AI", icon: BrainCircuit, step: "03" },
    ],
  },
  {
    num: 2, label: "สร้างคอนเทนต์ AI", color: "#4D7FFF",
    items: [
      { href: "/generate", label: "Generate Studio", icon: Sparkles, step: "04" },
      { href: "/scripts",  label: "แก้ไข Script",    icon: FileText, step: "05" },
      { href: "/voice",    label: "Caption & เสียง",  icon: Mic2,     step: "06" },
    ],
  },
  {
    num: 3, label: "เรนเดอร์ & ตรวจสอบ", color: "#FFB02E",
    items: [
      { href: "/render-queue", label: "Render Queue",   icon: Film,        step: "07" },
    ],
  },
  {
    num: 4, label: "พรีวิว & ตั้งเวลา", color: "#9B6FFF",
    items: [
      { href: "/preview",  label: "พรีวิว",    icon: Eye,          step: "08" },
      { href: "/approval", label: "อนุมัติ",   icon: CheckCircle2, step: "09" },
      { href: "/schedule", label: "Schedule",  icon: Calendar,     step: "10" },
    ],
  },
  {
    num: 5, label: "ผลตอบรับ", color: "#FF6FB7",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3, step: "11" },
    ],
  },
  {
    num: 0, label: "ระบบ", color: "#8890AE",
    items: [
      { href: "/accounts", label: "บัญชี / Token", icon: Link2, step: "12" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar">

      {/* Brand */}
      <div style={{ padding: "20px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div className="brand-mark">
            <Zap size={16} strokeWidth={3} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-.01em" }}>
              Content Studio
            </p>
            <p style={{ margin: 0, fontSize: 10, color: "var(--faint)" }}>AI Pipeline v2.0</p>
          </div>
        </div>

        <button className="sidebar-cta" onClick={() => router.push("/generate")}>
          <Plus size={14} strokeWidth={3} />
          สร้างคลิปใหม่
        </button>
      </div>

      {/* Scrollable nav */}
      <nav className="sidebar-inner nav-scroll">

        {/* Quick nav */}
        <div style={{ padding: "0 8px", marginBottom: 6 }}>
          {quickNav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`qnav-item${isActive(href) ? " active" : ""}`}>
              <span className="qnav-icon"><Icon size={13} strokeWidth={2} /></span>
              <span>{label}</span>
            </Link>
          ))}
        </div>

        <div className="sdiv" />

        {/* Workflow groups */}
        {groups.map((group) => (
          <div key={group.num} style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px 4px" }}>
              {group.num > 0 ? (
                <span style={{
                  width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                  background: `${group.color}22`, border: `1px solid ${group.color}44`,
                  color: group.color, fontSize: 9, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{group.num}</span>
              ) : (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: group.color, boxShadow: `0 0 6px ${group.color}99`,
                  marginLeft: 5,
                }} />
              )}
              <span style={{
                fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: ".07em", color: "var(--faint)",
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{group.label}</span>
            </div>

            <div style={{ padding: "0 6px 2px 20px" }}>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href}
                  className={`nav-item${isActive(item.href) ? " active" : ""}`}
                  style={{ border: "none" }}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: 7,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--glass2)", flexShrink: 0,
                  }}><item.icon size={12} strokeWidth={2} /></span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <span className="nav-step">{item.step}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Usage bar */}
      <div style={{ padding: "0 12px 10px" }}>
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
      <div style={{ padding: "8px 6px 14px", borderTop: "1px solid var(--gb)" }}>
        <button
          onClick={() => { localStorage.clear(); router.push("/login"); }}
          className="nav-item"
          style={{ width: "100%", border: "none", background: "none", cursor: "pointer" }}
        >
          <span style={{
            width: 24, height: 24, borderRadius: 7, display: "flex",
            alignItems: "center", justifyContent: "center", background: "var(--glass2)", flexShrink: 0,
          }}><LogOut size={12} strokeWidth={2} /></span>
          <span style={{ flex: 1, textAlign: "left" }}>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}
