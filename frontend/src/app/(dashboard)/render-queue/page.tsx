"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Film, Loader2, CheckCircle2, XCircle, Clock, RefreshCw, ThumbsUp, ThumbsDown, Eye } from "lucide-react";

interface Job {
  id: string;
  product_id: string;
  status: string;
  review_status: string;
  platform: string | null;
  error_message: string | null;
  retry_count: number;
  created_by: string | null;
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:     { label: "รอดำเนินการ", color: "var(--dim)",    bg: "rgba(255,255,255,.06)", icon: Clock },
  processing:  { label: "กำลังสร้าง",  color: "var(--blue)",   bg: "rgba(77,127,255,.1)",   icon: Loader2 },
  completed:   { label: "เสร็จสิ้น",   color: "var(--ok)",     bg: "rgba(34,212,153,.1)",   icon: CheckCircle2 },
  failed:      { label: "ล้มเหลว",     color: "var(--err)",    bg: "rgba(255,77,106,.1)",   icon: XCircle },
  dead_letter: { label: "ล้มเหลวถาวร", color: "var(--err)",    bg: "rgba(255,77,106,.12)",  icon: XCircle },
  retrying:    { label: "ลองใหม่",     color: "var(--warn)",   bg: "rgba(255,176,46,.1)",   icon: RefreshCw },
};

const REVIEW_CFG: Record<string, { label: string; color: string }> = {
  not_needed:   { label: "—",           color: "var(--faint)" },
  review_needed: { label: "รอตรวจสอบ", color: "var(--warn)" },
  approved:     { label: "อนุมัติแล้ว", color: "var(--ok)" },
  rejected:     { label: "ปฏิเสธ",     color: "var(--err)" },
};

const FILTER_TABS = [
  { val: "",          label: "ทั้งหมด" },
  { val: "pending",   label: "รอดำเนินการ" },
  { val: "processing", label: "กำลังสร้าง" },
  { val: "completed", label: "เสร็จสิ้น" },
  { val: "failed",    label: "ล้มเหลว" },
];

export default function RenderQueuePage() {
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const params = filter ? `?status=${filter}` : "";
    const r = await api.get(`/jobs/${params}`);
    setJobs(r.data);
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [filter]);

  const refresh = async () => {
    setRefreshing(true);
    await load().finally(() => setRefreshing(false));
  };

  const handleApprove = async (id: string) => {
    await api.patch(`/jobs/${id}/approve`);
    setJobs((j) => j.map((job) => job.id === id ? { ...job, review_status: "approved" } : job));
  };
  const handleReject = async (id: string) => {
    await api.patch(`/jobs/${id}/reject`);
    setJobs((j) => j.map((job) => job.id === id ? { ...job, review_status: "rejected" } : job));
  };

  const pendingCount   = jobs.filter((j) => j.status === "pending").length;
  const processingCount = jobs.filter((j) => j.status === "processing").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const reviewCount    = jobs.filter((j) => j.review_status === "review_needed").length;

  return (
    <div className="page-enter" style={{ padding: "32px 40px", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
          07 · เรนเดอร์
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>Render Queue</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dim)" }}>ติดตามและอนุมัติวิดีโอที่สร้างเสร็จ</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={refresh}>
            <RefreshCw size={13} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            รีเฟรช
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "รอดำเนินการ", val: pendingCount,   color: "var(--dim)",   bg: "rgba(255,255,255,.06)" },
          { label: "กำลังสร้าง",  val: processingCount, color: "var(--blue)",  bg: "rgba(77,127,255,.1)"   },
          { label: "เสร็จสิ้น",   val: completedCount, color: "var(--ok)",    bg: "rgba(34,212,153,.1)"   },
          { label: "รอตรวจสอบ",  val: reviewCount,    color: "var(--warn)",  bg: "rgba(255,176,46,.1)"   },
        ].map(({ label, val, color, bg }) => (
          <div key={label} style={{ padding: "14px 16px", background: bg, border: `1px solid ${color}25`, borderRadius: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {FILTER_TABS.map(({ val, label }) => (
          <button key={val} className={`filter-pill${filter === val ? " sel" : ""}`} onClick={() => setFilter(val)}>
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 24 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ height: 52, background: "var(--glass)", borderRadius: 10, marginBottom: 8, animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--faint)" }}>
            <Film size={40} strokeWidth={1} style={{ margin: "0 auto 12px", display: "block", opacity: .3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>ยังไม่มีงานในคิว</p>
            <p style={{ margin: "6px 0 0", fontSize: 12 }}>สร้างวิดีโอใน Generate Studio ก่อน</p>
          </div>
        ) : (
          <table className="cs-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Job ID</th>
                <th>สถานะ</th>
                <th>ตรวจสอบ</th>
                <th>แพลตฟอร์ม</th>
                <th>ลองใหม่</th>
                <th style={{ paddingRight: 20 }}>การกระทำ</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const sc = STATUS_CFG[job.status] || STATUS_CFG.pending;
                const rc = REVIEW_CFG[job.review_status] || REVIEW_CFG.not_needed;
                const Icon = sc.icon;
                return (
                  <tr key={job.id}>
                    <td style={{ paddingLeft: 20 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--dim)" }}>
                        {job.id.slice(0, 8)}…
                      </span>
                    </td>
                    <td>
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", borderRadius: 20,
                        background: sc.bg, color: sc.color,
                        fontSize: 11.5, fontWeight: 700,
                      }}>
                        <Icon size={11} strokeWidth={2} style={{ animation: job.status === "processing" ? "spin 1s linear infinite" : "none" }} />
                        {sc.label}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 700, color: rc.color }}>{rc.label}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: "var(--faint)" }}>{job.platform || "—"}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: job.retry_count > 0 ? "var(--warn)" : "var(--faint)" }}>
                        {job.retry_count}×
                      </span>
                    </td>
                    <td style={{ paddingRight: 20 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {job.review_status === "review_needed" && (
                          <>
                            <button className="btn btn-soft btn-sm" onClick={() => handleApprove(job.id)} style={{ gap: 5 }}>
                              <ThumbsUp size={11} />อนุมัติ
                            </button>
                            <button className="btn btn-err btn-sm" onClick={() => handleReject(job.id)} style={{ gap: 5 }}>
                              <ThumbsDown size={11} />ปฏิเสธ
                            </button>
                          </>
                        )}
                        <button className="icon-btn" title="ดูรายละเอียด"><Eye size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:.6; } 50% { opacity:1; } }
      `}</style>
    </div>
  );
}
