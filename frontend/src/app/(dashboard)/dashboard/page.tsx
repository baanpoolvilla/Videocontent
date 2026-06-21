"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Package, Film, Clock, CheckCircle2, TrendingUp, AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Stats {
  total_products: number;
  total_jobs: number;
  completed_jobs: number;
  pending_review: number;
  total_renders: number;
}

const KPIS = [
  { key: "total_products", label: "สินค้าทั้งหมด", icon: Package,      c: "var(--teal)",   bg: "rgba(0,255,212,.12)" },
  { key: "total_jobs",     label: "งานทั้งหมด",    icon: TrendingUp,   c: "var(--blue)",   bg: "rgba(77,127,255,.12)" },
  { key: "completed_jobs", label: "เสร็จสิ้น",      icon: CheckCircle2, c: "var(--ok)",     bg: "rgba(34,212,153,.12)" },
  { key: "pending_review", label: "รอตรวจสอบ",     icon: Clock,        c: "var(--warn)",   bg: "rgba(255,176,46,.12)" },
  { key: "total_renders",  label: "Renders",        icon: Film,         c: "var(--purple)", bg: "rgba(155,111,255,.12)" },
] as const;

const PIPELINE = [
  { label: "Upload → Analysis", pct: 100, c: "var(--teal)" },
  { label: "Analysis → Script", pct: 85,  c: "var(--teal)" },
  { label: "Script → Voice",    pct: 70,  c: "var(--blue)" },
  { label: "Voice → Video",     pct: 55,  c: "var(--blue)" },
  { label: "Video → Published", pct: 40,  c: "var(--purple)" },
];

const WEEK = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const BAR_H = [55, 80, 38, 95, 62, 45, 72];

export default function DashboardPage() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/stats")
      .then((r) => setStats(r.data))
      .catch(() => setStats({ total_products: 0, total_jobs: 0, completed_jobs: 0, pending_review: 0, total_renders: 0 }))
      .finally(() => setLoading(false));
  }, []);

  const val = (key: keyof Stats) => stats?.[key] ?? 0;

  return (
    <div className="page-enter" style={{ padding: "32px 40px", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
          01 · ภาพรวม
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>Dashboard</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dim)" }}>
              ข้อมูลย้อนหลัง 30 วัน · <span className="live-dot" />อัปเดตอัตโนมัติ
            </p>
          </div>
          <Link href="/generate" style={{ textDecoration: "none" }}>
            <button className="btn btn-primary">
              <span>สร้างคลิปใหม่</span>
              <ArrowRight size={14} strokeWidth={2.5} />
            </button>
          </Link>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 22 }}>
        {KPIS.map(({ key, label, icon: Icon, c, bg }) => (
          <div key={key} className="kpi">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                {label}
              </span>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={15} color={c} strokeWidth={2} />
              </div>
            </div>
            <p className="kpi-value" style={{ backgroundImage: `linear-gradient(135deg, var(--text) 30%, ${c})` }}>
              {loading ? "—" : val(key).toLocaleString("th-TH")}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>
              {key === "pending_review" && val("pending_review") > 0 ? "⚠ รอการอนุมัติ" : "↑ 12% เดือนที่แล้ว"}
            </p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Weekly bar chart */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>วิดีโอสัปดาห์นี้</h2>
            <span className="tag tag-ok">+18%</span>
          </div>
          <div className="bar-chart" style={{ height: 120 }}>
            {WEEK.map((day, i) => (
              <div key={day} className="bar-group">
                <div
                  className="bar"
                  style={{
                    height: `${BAR_H[i]}%`,
                    background: i === 3
                      ? "linear-gradient(180deg, var(--teal), var(--blue))"
                      : "rgba(255,255,255,.08)",
                    boxShadow: i === 3 ? "0 4px 16px rgba(0,255,212,.3)" : "none",
                    minHeight: 4,
                  }}
                />
                <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 600 }}>{day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline status */}
        <div className="card">
          <h2 style={{ margin: "0 0 16px", fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>Pipeline Status</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {PIPELINE.map(({ label, pct, c }) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11.5, color: "var(--dim)" }}>{label}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: c }}>{pct}%</span>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`,
                    background: c, borderRadius: 2,
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{
                      position: "absolute", top: 0, left: "-100%", width: "100%", height: "100%",
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,.4), transparent)",
                      animation: "shim 2s ease-in-out infinite",
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action needed */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <AlertTriangle size={15} color="var(--warn)" />
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>ต้องดำเนินการ</h2>
          </div>

          {!loading && val("pending_review") > 0 ? (
            <Link href="/render-queue" style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", background: "rgba(255,176,46,.08)",
                border: "1px solid rgba(255,176,46,.22)", borderRadius: 12,
                cursor: "pointer", transition: "var(--tr)",
              }}>
                <div>
                  <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>งานรอตรวจสอบ</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--dim)" }}>คลิกเพื่อดูรายการ</p>
                </div>
                <span style={{ fontSize: 28, fontWeight: 800, color: "var(--warn)" }}>{val("pending_review")}</span>
              </div>
            </Link>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 90, gap: 8 }}>
              <CheckCircle2 size={28} color="var(--ok)" strokeWidth={1.5} />
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--dim)" }}>ทุกอย่างเรียบร้อย ✓</p>
            </div>
          )}

          <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--glass)", borderRadius: 11, border: "1px solid var(--gb)" }}>
            <p style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 700, color: "var(--dim)" }}>ขั้นตอนถัดไป</p>
            <Link href="/generate" style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--teal)" }}>สร้างคลิปใหม่</span>
              <ArrowRight size={13} color="var(--teal)" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>กิจกรรมล่าสุด</h2>
          <Link href="/render-queue" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600 }}>ดูทั้งหมด →</span>
          </Link>
        </div>
        <table className="cs-table">
          <thead>
            <tr>
              <th>รหัสงาน</th>
              <th>สถานะ</th>
              <th>แพลตฟอร์ม</th>
              <th>เวลา</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--dim)" }}>d949483b…</td>
              <td><span className="tag tag-ok">completed</span></td>
              <td><span style={{ color: "var(--faint)", fontSize: 12 }}>TikTok</span></td>
              <td><span style={{ color: "var(--faint)", fontSize: 12 }}>2 นาทีที่แล้ว</span></td>
            </tr>
            <tr>
              <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--dim)" }}>39ccec88…</td>
              <td><span className="tag tag-warn">review_needed</span></td>
              <td><span style={{ color: "var(--faint)", fontSize: 12 }}>Instagram</span></td>
              <td><span style={{ color: "var(--faint)", fontSize: 12 }}>15 นาทีที่แล้ว</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
