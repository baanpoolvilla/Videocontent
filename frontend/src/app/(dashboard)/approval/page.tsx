"use client";

import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { CheckCircle2, XCircle, Loader2, Film, Download, Eye, RefreshCw, ThumbsUp, ThumbsDown, X } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }
interface RenderVersion {
  id: string; content_job_id: string; version_label: string | null;
  final_video_url: string | null; status: string; created_at: string;
}

function renderVersionLabel(renders: RenderVersion[], rv: RenderVersion): string {
  const sorted = [...renders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const idx = sorted.findIndex(r => r.id === rv.id);
  if (idx <= 0) return "ต้นฉบับ";
  return `อัพเดท ${idx}`;
}
interface Job {
  id: string; product_id: string; status: string; review_status: string;
  platform: string | null; created_at: string; updated_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ApprovalPage() {
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [loading, setLoading]   = useState(true);
  const [preview, setPreview]   = useState<{ job: Job; renders: RenderVersion[] } | null>(null);
  const [loadingRenders, setLoadingRenders] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [rendersByJob, setRendersByJob] = useState<Record<string, RenderVersion[]>>({});

  const load = async () => {
    const [j, p] = await Promise.all([api.get("/jobs/?limit=50"), api.get("/products/")]);
    const jobList: Job[] = j.data;
    setJobs(jobList);
    const m: Record<string, Product> = {};
    for (const x of p.data) m[x.id] = x;
    setProducts(m);

    const pendingJobs = jobList.filter(job => job.review_status === "review_needed");
    const map: Record<string, RenderVersion[]> = {};
    await Promise.all(
      pendingJobs.map(async job => {
        try {
          const r = await api.get(`/jobs/${job.id}/renders`);
          map[job.id] = r.data;
        } catch { /* skip */ }
      })
    );
    setRendersByJob(map);
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const openPreview = async (job: Job) => {
    setLoadingRenders(true);
    setPreview({ job, renders: [] });
    try {
      const r = await api.get(`/jobs/${job.id}/renders`);
      setPreview({ job, renders: r.data });
    } catch { /* ignore */ }
    setLoadingRenders(false);
  };

  const act = async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      await api.patch(`/jobs/${id}/${action}`);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, review_status: action === "approve" ? "approved" : "rejected" } : j));
      if (preview?.job.id === id) setPreview(prev => prev ? { ...prev, job: { ...prev.job, review_status: action === "approve" ? "approved" : "rejected" } } : null);
    } catch { /* ignore */ }
    setActing(null);
  };

  const pending  = jobs.filter(j => j.review_status === "review_needed");
  const approved = jobs.filter(j => j.review_status === "approved");
  const rejected = jobs.filter(j => j.review_status === "rejected");

  return (
    <div className="page-enter" style={{ padding: "32px 40px", minHeight: "100vh" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>10 · อนุมัติ</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>อนุมัติคอนเทนต์</h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--dim)" }}>ตรวจสอบและอนุมัติหรือปฏิเสธวิดีโอก่อนโพสต์</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => load()}>
          <RefreshCw size={13} /> รีเฟรช
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "รอตรวจสอบ", val: pending.length,  c: "var(--warn)",   bg: "rgba(255,176,46,.1)"  },
          { label: "อนุมัติแล้ว", val: approved.length, c: "var(--ok)",    bg: "rgba(34,212,153,.1)"  },
          { label: "ปฏิเสธ",     val: rejected.length, c: "var(--err)",   bg: "rgba(255,77,106,.1)"  },
        ].map(({ label, val, c, bg }) => (
          <div key={label} style={{ padding: "16px 18px", background: bg, border: `1px solid ${c}33`, borderRadius: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dim)" }}>{label}</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: c }}>{loading ? "—" : val}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--faint)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} />
          กำลังโหลด…
        </div>
      ) : pending.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <CheckCircle2 size={44} strokeWidth={1.2} color="var(--ok)" style={{ margin: "0 auto 14px", display: "block", opacity: .6 }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>ทุกอย่างเรียบร้อย!</p>
          <p style={{ fontSize: 13, color: "var(--faint)", margin: 0 }}>ไม่มีวิดีโอรอการอนุมัติในขณะนี้</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {pending.map(job => {
            const prod = products[job.product_id];
            const busy = acting === job.id;
            return (
              <div key={job.id} style={{ background: "var(--glass)", border: "1px solid rgba(255,176,46,.2)", borderRadius: 14, overflow: "hidden" }}>
                {/* Thumbnail */}
                <div style={{ height: 140, background: "var(--surface)", position: "relative", overflow: "hidden" }}>
                  {prod?.media_urls?.[0] ? (
                    <img src={fileUrl(prod.media_urls[0])} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                      <Film size={32} strokeWidth={1} style={{ opacity: .2 }} />
                    </div>
                  )}
                  <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#b86000", background: "rgba(255,176,46,.9)", padding: "3px 8px", borderRadius: 6 }}>รอตรวจ</span>
                    {(rendersByJob[job.id]?.length ?? 0) > 1 && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--teal)", background: "rgba(0,255,212,.85)", padding: "3px 8px", borderRadius: 6, color: "#06060a" }}>
                        {rendersByJob[job.id].length - 1} อัพเดท
                      </span>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div style={{ padding: "14px 16px" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 700 }}>{prod?.name || "ไม่ทราบสินค้า"}</p>
                  <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--faint)" }}>{fmtDate(job.created_at)}</p>

                  <button onClick={() => openPreview(job)} style={{
                    width: "100%", padding: "8px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: "1px solid var(--gb)", background: "var(--glass)", color: "var(--dim)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10,
                  }}>
                    <Eye size={13} /> ดูพรีวิว
                  </button>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button onClick={() => act(job.id, "approve")} disabled={busy} style={{
                      padding: "9px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer",
                      border: "none", background: busy ? "var(--glass2)" : "rgba(34,212,153,.15)",
                      color: busy ? "var(--faint)" : "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      border2: "1px solid rgba(34,212,153,.3)",
                    } as React.CSSProperties}>
                      {busy ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <ThumbsUp size={12} />} อนุมัติ
                    </button>
                    <button onClick={() => act(job.id, "reject")} disabled={busy} style={{
                      padding: "9px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer",
                      border: "none", background: busy ? "var(--glass2)" : "rgba(255,77,106,.12)",
                      color: busy ? "var(--faint)" : "var(--err)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    }}>
                      {busy ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <ThumbsDown size={12} />} ปฏิเสธ
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approved / Rejected section */}
      {(approved.length > 0 || rejected.length > 0) && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--dim)", marginBottom: 12 }}>ที่ดำเนินการแล้ว</h2>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="cs-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 20 }}>สินค้า</th>
                  <th>สถานะ</th>
                  <th>เวลา</th>
                  <th style={{ paddingRight: 20 }}>การกระทำ</th>
                </tr>
              </thead>
              <tbody>
                {[...approved, ...rejected].map(job => {
                  const prod = products[job.product_id];
                  const isApproved = job.review_status === "approved";
                  return (
                    <tr key={job.id}>
                      <td style={{ paddingLeft: 20, fontWeight: 600 }}>{prod?.name || job.id.slice(0, 8)}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isApproved ? "var(--ok)" : "var(--err)", background: isApproved ? "rgba(34,212,153,.1)" : "rgba(255,77,106,.1)", padding: "3px 10px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {isApproved ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                          {isApproved ? "อนุมัติแล้ว" : "ปฏิเสธ"}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--faint)" }}>{fmtDate(job.updated_at)}</td>
                      <td style={{ paddingRight: 20 }}>
                        <button className="icon-btn" onClick={() => openPreview(job)}><Eye size={12} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => setPreview(null)}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--gb)",
            borderRadius: 20, padding: 28, width: "100%", maxWidth: 520,
            maxHeight: "90vh", overflowY: "auto",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>พรีวิววิดีโอ</h2>
              <button className="icon-btn" onClick={() => setPreview(null)}><X size={14} /></button>
            </div>

            {loadingRenders ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} color="var(--teal)" />
                <p style={{ color: "var(--faint)", fontSize: 13, margin: 0 }}>โหลดวิดีโอ…</p>
              </div>
            ) : preview.renders.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <Film size={32} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", opacity: .3 }} />
                <p style={{ color: "var(--faint)", fontSize: 13, margin: 0 }}>ยังไม่มีวิดีโอ render สำหรับ job นี้</p>
              </div>
            ) : (() => {
              const sorted = [...preview.renders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              return sorted.map(rv => {
                const label = renderVersionLabel(sorted, rv);
                const isUpdate = label !== "ต้นฉบับ";
                return (
                  <div key={rv.id} style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 6,
                        background: isUpdate ? "rgba(0,255,212,.15)" : "rgba(255,255,255,.08)",
                        color: isUpdate ? "var(--teal)" : "var(--dim)",
                        border: `1px solid ${isUpdate ? "rgba(0,255,212,.3)" : "var(--gb)"}`,
                      }}>{label}</span>
                      {isUpdate && <span style={{ fontSize: 10, color: "var(--faint)" }}>ใส่เสียงใหม่</span>}
                    </div>
                    {rv.final_video_url && (
                      <>
                        <video src={fileUrl(rv.final_video_url)} controls style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 340 }} />
                        <a href={fileUrl(rv.final_video_url)} download style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: "var(--teal)", textDecoration: "none", fontWeight: 600 }}>
                          <Download size={13} /> ดาวน์โหลด
                        </a>
                      </>
                    )}
                  </div>
                );
              });
            })()}

            {preview.job.review_status === "review_needed" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                <button onClick={() => act(preview.job.id, "approve")} disabled={!!acting} style={{
                  padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
                  border: "none", background: "rgba(34,212,153,.15)", color: "var(--ok)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <ThumbsUp size={14} /> อนุมัติ
                </button>
                <button onClick={() => act(preview.job.id, "reject")} disabled={!!acting} style={{
                  padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
                  border: "none", background: "rgba(255,77,106,.12)", color: "var(--err)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <ThumbsDown size={14} /> ปฏิเสธ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
