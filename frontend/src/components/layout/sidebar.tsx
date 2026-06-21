"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Home, Package, BrainCircuit, FileText, Mic2,
  Film, ShieldCheck, Eye, CheckCircle2, Calendar, BarChart3,
  Link2, LogOut, Sparkles, Cpu, Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Navigation data ── */

const quickNav = [
  { href: "/",          label: "หน้าแรก",   icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

type GroupItem = { href: string; label: string; icon: LucideIcon; step: string };
type Group     = { num: number; label: string; color: string; items: GroupItem[] };

const groups: Group[] = [
  {
    num: 1, label: "อัปโหลด & วิเคราะห์", color: "#34D399",
    items: [
      { href: "/products", label: "อัปโหลดสินค้า",  icon: Package,      step: "02" },
      { href: "/analysis", label: "ผลวิเคราะห์ AI", icon: BrainCircuit, step: "03" },
    ],
  },
  {
    num: 2, label: "สร้างคอนเทนต์ AI", color: "#00D9C0",
    items: [
      { href: "/generate", label: "เทมเพลต",        icon: Sparkles, step: "04" },
      { href: "/scripts",  label: "แก้ไข Script",   icon: FileText, step: "05" },
      { href: "/voice",    label: "Caption & เสียง", icon: Mic2,     step: "06" },
    ],
  },
  {
    num: 3, label: "เรนเดอร์ & ตรวจสอบ", color: "#F5C04E",
    items: [
      { href: "/render-queue", label: "คิวเรนเดอร์",      icon: Film,        step: "07" },
      { href: "/compliance",   label: "ตรวจสอบมาตรฐาน", icon: ShieldCheck, step: "08" },
    ],
  },
  {
    num: 4, label: "พรีวิว & ตั้งเวลา", color: "#5B8CFF",
    items: [
      { href: "/preview",  label: "พรีวิว A–E",  icon: Eye,          step: "09" },
      { href: "/approval", label: "อนุมัติ",      icon: CheckCircle2, step: "10" },
      { href: "/schedule", label: "Schedule",     icon: Calendar,     step: "11" },
    ],
  },
  {
    num: 5, label: "ผลตอบรับ", color: "#FF6FA5",
    items: [
      { href: "/analytics", label: "ผลตอบรับ", icon: BarChart3, step: "12" },
    ],
  },
  {
    num: 0, label: "ระบบ", color: "#9A9DA6",
    items: [
      { href: "/accounts", label: "บัญชี / Token", icon: Link2, step: "13" },
    ],
  },
];

/* ── Sub-components ── */

function QNavItem({
  href, label, icon: Icon, active,
}: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link href={href} className={`qnav-item${active ? " active" : ""}`}>
      <span className="qnav-icon">
        <Icon size={13} strokeWidth={2} />
      </span>
      <span className="nav-label">{label}</span>
    </Link>
  );
}

function NavItem({
  href, label, icon: Icon, step, active,
}: GroupItem & { active: boolean }) {
  return (
    <Link href={href} className={`nav-item${active ? " active" : ""}`}>
      <span className="nav-icon">
        <Icon size={13} strokeWidth={2} />
      </span>
      <span className="nav-label">{label}</span>
      <span className="nav-step">{step}</span>
    </Link>
  );
}

/* ── Main component ── */

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside style={{
      width: 248, flexShrink: 0,
      background: "var(--cs-panel)",
      borderRight: "1px solid var(--cs-line)",
      display: "flex", flexDirection: "column",
      height: "100vh", overflow: "hidden",
    }}>

      {/* ── Brand ── */}
      <div style={{ padding: "18px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, var(--cs-teal), var(--cs-blue))",
            boxShadow: "0 4px 14px rgba(0,217,192,.32)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Cpu size={16} color="#06201D" strokeWidth={2.5} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "var(--cs-text)", letterSpacing: "-.01em" }}>
              Content Studio
            </p>
            <p style={{ margin: 0, fontSize: 10, color: "var(--cs-faint)" }}>
              AI Pipeline v1.1
            </p>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push("/generate")}
          style={{
            width: "100%", padding: "10px 14px",
            background: "linear-gradient(90deg, var(--cs-teal), var(--cs-blue))",
            color: "#05201D", borderRadius: 11, fontSize: 13, fontWeight: 800,
            border: "none", cursor: "pointer",
            boxShadow: "0 3px 16px rgba(0,217,192,.28)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            letterSpacing: ".01em", transition: "opacity .1s, transform .08s",
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
          onMouseDown={e  => { e.currentTarget.style.transform = "scale(.97)"; }}
          onMouseUp={e    => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <Plus size={14} strokeWidth={3} />
          สร้างคลิปใหม่
        </button>
      </div>

      {/* ── Scrollable nav (no scrollbar) ── */}
      <nav className="nav-scroll" style={{ flex: 1, overflowY: "auto", paddingBottom: 6 }}>

        {/* Quick access */}
        <div style={{ padding: "0 8px", marginBottom: 8 }}>
          {quickNav.map(({ href, label, icon }) => (
            <QNavItem key={href} href={href} label={label} icon={icon} active={isActive(href)} />
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--cs-line)", margin: "0 16px 12px" }} />

        {/* Workflow groups */}
        {groups.map((group) => (
          <div key={group.num} style={{ marginBottom: 6 }}>

            {/* Group header — colored number badge + label */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px 5px 14px",
            }}>
              {group.num > 0 ? (
                <span style={{
                  width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                  background: `${group.color}28`,
                  border: `1px solid ${group.color}55`,
                  color: group.color,
                  fontSize: 9, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {group.num}
                </span>
              ) : (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: group.color,
                  boxShadow: `0 0 6px ${group.color}88`,
                  marginLeft: 5,
                }} />
              )}
              <span style={{
                fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: ".07em",
                color: "var(--cs-faint)",
                flex: 1, minWidth: 0, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {group.label}
              </span>
            </div>

            {/* Items */}
            <div style={{ padding: "0 6px 4px 22px" }}>
              {group.items.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Render usage ── */}
      <div style={{ padding: "0 12px 10px" }}>
        <div style={{
          background: "var(--cs-panel2)", border: "1px solid var(--cs-line)",
          borderRadius: 11, padding: "10px 12px",
          fontSize: 11, color: "var(--cs-dim)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>⚡ เรนเดอร์วันนี้</span>
            <b style={{ color: "var(--cs-teal)", fontSize: 11.5 }}>62%</b>
          </div>
          <div style={{ height: 4, background: "var(--cs-line)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: "62%",
              background: "linear-gradient(90deg, var(--cs-teal), var(--cs-blue))",
              borderRadius: 2,
            }} />
          </div>
        </div>
      </div>

      {/* ── Logout ── */}
      <div style={{ padding: "8px 6px 14px", borderTop: "1px solid var(--cs-line)" }}>
        <button
          onClick={() => { localStorage.clear(); router.push("/login"); }}
          className="nav-item"
          style={{ width: "100%", border: "none", textAlign: "left" }}
        >
          <span className="nav-icon"><LogOut size={13} strokeWidth={2} /></span>
          <span className="nav-label">ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}
