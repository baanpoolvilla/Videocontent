"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Package, Film, Clock, CheckCircle2, TrendingUp, AlertTriangle } from "lucide-react";

interface Stats {
  total_products: number;
  total_jobs: number;
  completed_jobs: number;
  pending_review: number;
  total_renders: number;
}

const KPI_CARDS = [
  { key: "total_products", label: "สินค้าทั้งหมด", icon: Package,      accent: "var(--cs-teal)" },
  { key: "total_jobs",     label: "งานทั้งหมด",    icon: TrendingUp,   accent: "var(--cs-blue)" },
  { key: "completed_jobs", label: "เสร็จสิ้น",      icon: CheckCircle2, accent: "var(--cs-green)" },
  { key: "pending_review", label: "รอตรวจสอบ",     icon: Clock,        accent: "var(--cs-yellow)" },
  { key: "total_renders",  label: "Renders",        icon: Film,         accent: "var(--cs-pink)" },
] as const;

const PIPELINE = [
  { label: "Upload → Analysis", pct: 100, color: "var(--cs-teal)" },
  { label: "Analysis → Script", pct: 85,  color: "var(--cs-teal)" },
  { label: "Script → Voice",    pct: 70,  color: "var(--cs-blue)" },
  { label: "Voice → Video",     pct: 55,  color: "var(--cs-blue)" },
  { label: "Video → Published", pct: 40,  color: "var(--cs-pink)" },
];

function StatCard({
  label, value, icon: Icon, accent,
}: { label: string; value: number; icon: React.ElementType; accent: string }) {
  return (
    <div style={{
      background: "var(--cs-panel)",
      border: "1px solid var(--cs-line)",
      borderRadius: 14,
      padding: "18px 20px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      boxShadow: "0 4px 16px rgba(0,0,0,.2)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: `${accent}20`,
        border: `1px solid ${accent}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={20} color={accent} strokeWidth={2} />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 11, color: "var(--cs-faint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
          {label}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: "var(--cs-text)", letterSpacing: "-.01em" }}>
          {value.toLocaleString("th-TH")}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => {
      setStats(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 24 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 88, borderRadius: 14, background: "var(--cs-panel)", animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ height: 220, borderRadius: 14, background: "var(--cs-panel)" }} />
          ))}
        </div>
      </div>
    );
  }

  const val = (key: keyof Stats) => stats?.[key] ?? 0;

  return (
    <div style={{ padding: 32 }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--cs-faint)", marginBottom: 5 }}>
          01 · ภาพรวม
        </p>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--cs-text)", letterSpacing: "-.015em" }}>
          Dashboard
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--cs-dim)" }}>
          ข้อมูลย้อนหลัง 30 วัน — ดูว่าควรทำคอนเทนต์แนวไหนต่อ
        </p>
      </div>

      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 20 }}>
        {KPI_CARDS.map(({ key, label, icon, accent }) => (
          <StatCard key={key} label={label} value={val(key)} icon={icon} accent={accent} />
        ))}
      </div>

      {/* Detail panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Pipeline status */}
        <div style={{
          background: "var(--cs-panel)",
          border: "1px solid var(--cs-line)",
          borderRadius: 14,
          padding: "22px 24px",
          boxShadow: "0 4px 16px rgba(0,0,0,.18)",
        }}>
          <h2 style={{ margin: "0 0 18px", fontSize: 13.5, fontWeight: 700, color: "var(--cs-text)" }}>
            Pipeline Status
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {PIPELINE.map(({ label, pct, color }) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, color: "var(--cs-dim)" }}>{label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--cs-text)" }}>{pct}%</span>
                </div>
                <div style={{ height: 5, background: "var(--cs-panel2)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .4s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action required */}
        <div style={{
          background: "var(--cs-panel)",
          border: "1px solid var(--cs-line)",
          borderRadius: 14,
          padding: "22px 24px",
          boxShadow: "0 4px 16px rgba(0,0,0,.18)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <AlertTriangle size={16} color="var(--cs-yellow)" strokeWidth={2} />
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--cs-text)" }}>
              ต้องดำเนินการ
            </h2>
          </div>

          {val("pending_review") > 0 ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "13px 16px",
              background: "rgba(245,192,78,.1)",
              border: "1px solid rgba(245,192,78,.25)",
              borderRadius: 11,
            }}>
              <span style={{ fontSize: 13, color: "var(--cs-dim)" }}>งานรอตรวจสอบ</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "var(--cs-yellow)" }}>
                {val("pending_review")}
              </span>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 80, color: "var(--cs-faint)", fontSize: 13,
            }}>
              ไม่มีงานที่ต้องดำเนินการ ✓
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
