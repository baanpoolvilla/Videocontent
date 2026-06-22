"use client";

import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Film, Loader2, Download, Play, X, RefreshCw } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }
interface RenderVersion {
  id: string; content_job_id: string; version_label: string | null;
  final_video_url: string | null; status: string;
  ffmpeg_config: Record<string, unknown> | null; created_at: string;
}
interface Job { id: string; product_id: string; status: string; review_status: string; created_at: string; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PreviewPage() {
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [renders, setRenders]   = useState<Record<string, RenderVersion[]>>({});
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<RenderVersion | null>(null);
  const [filter, setFilter]     = useState<"all" | "completed" | "review_needed" | "approved">("all");

  useEffect(() => {
    Promise.all([api.get("/jobs/?limit=50"), api.get("/products/")]).then(async ([j, p]) => {
      const jData: Job[] = j.data;
      setJobs(jData);
      const m: Record<string, Product> = {};
      for (const x of p.data) m[x.id] = x;
      setProducts(m);

      const completed = jData.filter(job => job.status === "completed");
      await Promise.all(completed.map(async job => {
        try {
          const r = await api.get(`/jobs/${job.id}/renders`);
          if (r.data.length > 0) {
            setRenders(prev => ({ ...prev, [job.id]: r.data }));
          }
        } catch { /* skip */ }
      }));
    }).finally(() => setLoading(false));
  }, []);

  const allRenders = Object.entries(renders).flatMap(([jobId, rvs]) =>
    rvs.map(rv => ({ ...rv, jobId, job: jobs.find(j => j.id === jobId)! }))
  ).filter(r => r.final_video_url).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filtered = allRenders.filter(r => {
    if (!r.job) return false;
    if (filter === "completed")     return r.job.status === "completed";
    if (filter === "review_needed") return r.job.review_status === "review_needed";
    if (filter === "approved")      return r.job.review_status === "approved";
    return true;
  });

  return (
    <div className="page-enter" style={{ padding: "32px 40px", minHeight: "100vh" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>09 · พรีวิว</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>พรีวิวเวอร์ชัน</h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--dim)" }}>ดูและเปรียบเทียบวิดีโอทุกเวอร์ชันที่ render แล้ว</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
          <RefreshCw size={13} /> รีเฟรช
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {(["all", "review_needed", "approved", "completed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`filter-pill${filter === f ? " sel" : ""}`}>
            {f === "all" ? "ทั้งหมด" : f === "review_needed" ? "รอตรวจ" : f === "approved" ? "อนุมัติแล้ว" : "เสร็จสิ้น"}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--faint)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} />
          กำลังโหลดวิดีโอ…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Film size={44} strokeWidth={1} style={{ margin: "0 auto 14px", display: "block", opacity: .25 }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--dim)", margin: "0 0 6px" }}>ยังไม่มีวิดีโอ</p>
          <p style={{ fontSize: 13, color: "var(--faint)", margin: 0 }}>สร้างวิดีโอใน Generate Studio ก่อน</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {filtered.map(rv => {
            const prod = rv.job ? products[rv.job.product_id] : null;
            const isApproved = rv.job?.review_status === "approved";
            const isPending  = rv.job?.review_status === "review_needed";
            return (
              <div key={rv.id} style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, overflow: "hidden", cursor: "pointer" }}
                onClick={() => setSelected(rv)}>
                {/* Video thumbnail */}
                <div style={{ position: "relative", background: "#000", aspectRatio: "9/16", maxHeight: 240, overflow: "hidden" }}>
                  <video
                    src={fileUrl(rv.final_video_url!)}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    muted preload="metadata"
                  />
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(to top, rgba(0,0,0,.6) 0%, transparent 50%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: "rgba(255,255,255,.15)", backdropFilter: "blur(4px)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Play size={18} color="#fff" fill="#fff" />
                    </div>
                  </div>
                  {(isApproved || isPending) && (
                    <div style={{ position: "absolute", top: 8, left: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: isApproved ? "rgba(34,212,153,.9)" : "rgba(255,176,46,.9)", color: isApproved ? "#06060A" : "#7a4700" }}>
                        {isApproved ? "อนุมัติ" : "รอตรวจ"}
                      </span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div style={{ padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {prod?.name || "ไม่ทราบ"}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>
                    {rv.version_label || "v1"} · {fmtDate(rv.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,.88)", backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setSelected(null)}>
          <div style={{ position: "relative", maxWidth: 360, width: "100%" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} style={{
              position: "absolute", top: -44, right: 0, background: "rgba(255,255,255,.1)",
              border: "none", borderRadius: 8, cursor: "pointer", color: "#fff",
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            }}><X size={16} /></button>
            <video src={fileUrl(selected.final_video_url!)} controls autoPlay style={{
              width: "100%", aspectRatio: "9/16", borderRadius: 16, background: "#000",
              maxHeight: "80vh", display: "block",
            }} />
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <a href={fileUrl(selected.final_video_url!)} download style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 22px", borderRadius: 10,
                background: "rgba(0,255,212,.15)", border: "1px solid rgba(0,255,212,.3)",
                color: "var(--teal)", textDecoration: "none", fontSize: 13, fontWeight: 700,
              }}>
                <Download size={14} /> ดาวน์โหลดวิดีโอ
              </a>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
