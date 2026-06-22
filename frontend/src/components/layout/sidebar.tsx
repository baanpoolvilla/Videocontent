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
      { href: "/accounts", label: "เชื่อมต่อบัญชี / Token", icon: Link2, step: "13" },
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
              <span style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: group.color, boxShadow: `0 0 6px ${group.color}99`,
                marginLeft: 2,
              }} />
              <span style={{
                fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: ".07em", color: "var(--faint)", flex: 1,
              }}>{group.num !== "–" ? `${group.num}. ` : ""}{group.label}</span>
            </div>

            <div style={{ padding: "0 6px 2px 20px" }}>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href}
                  className={`nav-item${isActive(item.href) ? " active" : ""}`}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: 6,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--glass2)", flexShrink: 0, fontSize: 9, fontWeight: 800,
                    color: isActive(item.href) ? "var(--teal)" : "var(--faint)",
                  }}>{item.step}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
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
            width: 22, height: 22, borderRadius: 6, display: "flex",
            alignItems: "center", justifyContent: "center", background: "var(--glass2)", flexShrink: 0,
          }}><LogOut size={11} strokeWidth={2} /></span>
          <span style={{ flex: 1, textAlign: "left" }}>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}
