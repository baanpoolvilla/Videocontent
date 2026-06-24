"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, fileUrl } from "@/lib/api";
import { CheckCircle2, Clock, ChevronDown, ChevronUp, Pencil, Save, X, Loader2, Mic2, Film, RotateCcw, AlertCircle, Trash2 } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }
interface Script {
  id: string; content_job_id: string;
  hook: string | null; body: string | null; cta: string | null; full_script: string | null;
  version: number; is_approved: boolean; reviewer_notes: string | null;
  tokens_used: number | null; created_at: string; updated_at: string;
}
interface Job {
  id: string; product_id: string; status: string; review_status: string;
  platform: string | null; error_message: string | null;
  created_at: string; updated_at: string;
}

type FilterKey = "all" | "pending" | "approved" | "processing";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ScriptsPage() {
  const router = useRouter();
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [scripts, setScripts]   = useState<Record<string, Script[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter]     = useState<FilterKey>("all");
  const [loading, setLoading]   = useState(true);

  // Edit state
  const [editing, setEditing]   = useState<string | null>(null); // script id
  const [editDraft, setEditDraft] = useState<Partial<Script>>({});
  const [saving, setSaving]     = useState(false);

  // Action state per job
  const [voicing, setVoicing]   = useState<string | null>(null);
  const [rendering, setRendering] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/jobs/"),
      api.get("/products/"),
    ]).then(([jobsRes, prodsRes]) => {
      setJobs(jobsRes.data);
      const prodMap: Record<string, Product> = {};
      for (const p of prodsRes.data) prodMap[p.id] = p;
      setProducts(prodMap);
    }).finally(() => setLoading(false));
  }, []);

  const loadScripts = useCallback(async (jobId: string) => {
    if (scripts[jobId]) return;
    const res = await api.get(`/jobs/${jobId}/scripts`);
    setScripts(prev => ({ ...prev, [jobId]: res.data }));
  }, [scripts]);

  const toggleJob = async (jobId: string) => {
    if (expanded === jobId) { setExpanded(null); return; }
    setExpanded(jobId);
    await loadScripts(jobId);
  };

  const startEdit = (s: Script) => {
    setEditing(s.id);
    setEditDraft({ hook: s.hook, body: s.body, cta: s.cta, full_script: s.full_script, reviewer_notes: s.reviewer_notes });
  };

  const saveEdit = async (s: Script) => {
    setSaving(true);
    try {
      const params: Record<string, string | boolean> = {};
      if (editDraft.hook !== s.hook && editDraft.hook != null) params.hook = editDraft.hook;
      if (editDraft.body !== s.body && editDraft.body != null) params.body = editDraft.body;
      if (editDraft.cta !== s.cta && editDraft.cta != null) params.cta = editDraft.cta;
      if (editDraft.full_script !== s.full_script && editDraft.full_script != null) params.full_script = editDraft.full_script;
      if (editDraft.reviewer_notes !== s.reviewer_notes) params.reviewer_notes = editDraft.reviewer_notes || "";
      const res = await api.patch(`/jobs/${s.content_job_id}/scripts/${s.id}`, null, { params });
      setScripts(prev => ({
        ...prev,
        [s.content_job_id]: prev[s.content_job_id].map(x => x.id === s.id ? res.data : x),
      }));
      setEditing(null);
    } finally { setSaving(false); }
  };

  const approveScript = async (s: Script) => {
    const res = await api.patch(`/jobs/${s.content_job_id}/scripts/${s.id}`, null, { params: { is_approved: !s.is_approved } });
    setScripts(prev => ({
      ...prev,
      [s.content_job_id]: prev[s.content_job_id].map(x => x.id === s.id ? res.data : x),
    }));
  };

  // ใส่เสียงให้วิดีโอที่ render ไว้แล้ว — ไม่สร้างวิดีโอใหม่ ไม่เสีย credit
  const runVoiceOnly = async (jobId: string, _scriptId: string) => {
    setVoicing(jobId);
    setActionMsg(prev => ({ ...prev, [jobId]: "กำลังสร้างเสียงพากย์…" }));
    try {
      // Step 1: generate voiceover TTS
      const vRes = await api.post(`/jobs/${jobId}/voiceover`, null, {});
      const voiceoverUrl: string = vRes.data.voiceover_url || "";
      if (!voiceoverUrl) throw new Error("ไม่ได้รับ URL เสียง — ลองใหม่อีกครั้ง");

      setVoicing(null); setRendering(jobId);
      setActionMsg(prev => ({ ...prev, [jobId]: "กำลัง mix เสียงกับวิดีโอเดิม (ฟรี)…" }));

      // Step 2: remix-audio — take existing render + new voiceover, no fal.ai call
      await api.post(`/jobs/${jobId}/remix-audio`, null, {
        params: { voiceover_url: voiceoverUrl },
      });

      // Step 3: poll until completed or failed (max 2 min)
      let done = false;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const jobRes = await api.get(`/jobs/${jobId}`);
        if (jobRes.data.status === "completed") { done = true; break; }
        if (jobRes.data.status === "failed") throw new Error("Mix audio ล้มเหลว — ดู Preview เพื่อดูวิดีโอเดิม");
      }
      if (!done) throw new Error("หมดเวลารอ — กรุณาลองใหม่");

      setActionMsg(prev => ({ ...prev, [jobId]: "✅ ใส่เสียงสำเร็จ! กำลังไปที่ Preview…" }));
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: "completed" } : j));
      // navigate to preview so user sees the freshly-remixed video immediately
      setTimeout(() => router.push("/preview"), 800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
      setActionMsg(prev => ({ ...prev, [jobId]: `❌ ${msg}` }));
    } finally { setVoicing(null); setRendering(null); }
  };

  const runVoiceAndRender = runVoiceOnly;

  const deleteJob = async (jobId: string) => {
    setDeleting(jobId);
    try {
      await api.delete(`/jobs/${jobId}`);
      setJobs(prev => prev.filter(j => j.id !== jobId));
      setConfirmDelete(null);
      if (expanded === jobId) setExpanded(null);
    } catch {
      setActionMsg(prev => ({ ...prev, [jobId]: "❌ ลบไม่สำเร็จ" }));
    } finally { setDeleting(null); }
  };

  const jobsWithScripts = jobs.filter(j => {
    if (filter === "pending")    return j.review_status === "review_needed" || j.status === "processing";
    if (filter === "approved")   return j.review_status === "approved";
    if (filter === "processing") return j.status === "processing";
    return true;
  });

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all",        label: `ทั้งหมด (${jobs.length})` },
    { key: "pending",    label: `รอตรวจ (${jobs.filter(j => j.review_status === "review_needed").length})` },
    { key: "approved",   label: `อนุมัติแล้ว (${jobs.filter(j => j.review_status === "approved").length})` },
    { key: "processing", label: `กำลังสร้าง (${jobs.filter(j => j.status === "processing").length})` },
  ];

  return (
    <div className="page-enter" style={{ padding: "28px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>05 · กลุ่ม 2</p>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800 }}>แก้ไข Script</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--dim)" }}>ตรวจสอบและแก้ไข Script ที่ AI สร้าง ก่อน render วิดีโอ</p>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid var(--gb)", paddingBottom: 14 }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${filter === f.key ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
            background: filter === f.key ? "rgba(0,255,212,.1)" : "var(--glass)",
            color: filter === f.key ? "var(--teal)" : "var(--faint)",
          }}>{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--faint)", fontSize: 13 }}>
          <Loader2 size={22} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} />
          กำลังโหลด…
        </div>
      ) : jobsWithScripts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: .3 }}>📄</div>
          <p style={{ fontSize: 14, color: "var(--dim)", fontWeight: 700 }}>ยังไม่มี Script</p>
          <p style={{ fontSize: 12, color: "var(--faint)" }}>ไปที่หน้า Generate เพื่อสร้าง Script ก่อน</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {jobsWithScripts.map(job => {
            const prod = products[job.product_id];
            const jobScripts = scripts[job.id] || [];
            const isOpen = expanded === job.id;
            const isVoicing = voicing === job.id;
            const isRendering = rendering === job.id;
            const busy = isVoicing || isRendering;
            const msg = actionMsg[job.id];

            return (
              <div key={job.id} style={{ background: "var(--glass)", border: `1px solid ${isOpen ? "rgba(0,255,212,.2)" : "var(--gb)"}`, borderRadius: 14, overflow: "hidden", transition: "border-color .15s" }}>

                {/* Job header */}
                <div onClick={() => toggleJob(job.id)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                  {prod?.media_urls?.[0] && (
                    <img src={fileUrl(prod.media_urls[0])} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{prod?.name || "ไม่ทราบสินค้า"}</div>
                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
                      {job.id.slice(0, 8)}… · {fmtDate(job.created_at)} · {job.platform || "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusBadge status={job.status} reviewStatus={job.review_status} />
                    {/* Delete button — stop propagation so it doesn't toggle expand */}
                    {confirmDelete === job.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }} onClick={e => e.stopPropagation()}>
                        <span style={{ fontSize: 11, color: "var(--err)", fontWeight: 700 }}>ยืนยันลบ?</span>
                        <button onClick={() => deleteJob(job.id)} disabled={deleting === job.id} style={{
                          padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          border: "1px solid rgba(255,77,106,.4)", background: "rgba(255,77,106,.15)", color: "var(--err)",
                        }}>
                          {deleting === job.id ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : "ลบ"}
                        </button>
                        <button onClick={() => setConfirmDelete(null)} style={{
                          padding: "4px 8px", borderRadius: 7, fontSize: 11, cursor: "pointer",
                          border: "1px solid var(--gb)", background: "transparent", color: "var(--faint)",
                        }}>ยกเลิก</button>
                      </div>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setConfirmDelete(job.id); }} title="ลบ job นี้" style={{
                        width: 28, height: 28, borderRadius: 7, border: "1px solid var(--gb)",
                        background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        color: "var(--faint)", transition: "color .15s, border-color .15s",
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--err)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,77,106,.4)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--faint)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gb)"; }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    {isOpen ? <ChevronUp size={14} color="var(--faint)" /> : <ChevronDown size={14} color="var(--faint)" />}
                  </div>
                </div>

                {/* Scripts */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--gb)", padding: "16px 18px" }}>
                    {jobScripts.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--faint)", textAlign: "center", padding: "20px 0" }}>ยังไม่มี Script สำหรับงานนี้</p>
                    ) : jobScripts.map(s => {
                      const isEditing = editing === s.id;
                      return (
                        <div key={s.id} style={{ marginBottom: 14 }}>
                          {/* Script version header */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--teal)", background: "rgba(0,255,212,.1)", border: "1px solid rgba(0,255,212,.2)", padding: "2px 8px", borderRadius: 5 }}>
                              Ver. {s.version}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--faint)" }}>{fmtDate(s.updated_at)}</span>
                            {s.tokens_used && <span style={{ fontSize: 10.5, color: "var(--faint)", marginLeft: "auto" }}>{s.tokens_used.toLocaleString()} tokens</span>}
                            <div style={{ display: "flex", gap: 5 }}>
                              {isEditing ? (
                                <>
                                  <button onClick={() => saveEdit(s)} disabled={saving} style={{ padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(0,255,212,.3)", background: "rgba(0,255,212,.1)", color: "var(--teal)", display: "flex", alignItems: "center", gap: 4 }}>
                                    {saving ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={10} />} บันทึก
                                  </button>
                                  <button onClick={() => setEditing(null)} style={{ padding: "4px 8px", borderRadius: 7, fontSize: 11, cursor: "pointer", border: "1px solid var(--gb)", background: "transparent", color: "var(--faint)" }}>
                                    <X size={10} />
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => startEdit(s)} style={{ padding: "4px 9px", borderRadius: 7, fontSize: 11, cursor: "pointer", border: "1px solid var(--gb)", background: "transparent", color: "var(--faint)", display: "flex", alignItems: "center", gap: 4 }}>
                                  <Pencil size={10} /> แก้ไข
                                </button>
                              )}
                              <button onClick={() => approveScript(s)} style={{
                                padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                                border: `1px solid ${s.is_approved ? "rgba(34,212,153,.3)" : "var(--gb)"}`,
                                background: s.is_approved ? "rgba(34,212,153,.1)" : "transparent",
                                color: s.is_approved ? "var(--ok)" : "var(--faint)",
                                display: "flex", alignItems: "center", gap: 4,
                              }}>
                                <CheckCircle2 size={10} /> {s.is_approved ? "อนุมัติแล้ว" : "อนุมัติ"}
                              </button>
                            </div>
                          </div>

                          {/* Script content */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8, marginBottom: 10 }}>
                            {(["hook", "body", "cta"] as const).map(field => (
                              <div key={field} style={{ background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 10, padding: "10px 12px" }}>
                                <p style={{ margin: "0 0 6px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: field === "hook" ? "var(--teal)" : field === "cta" ? "var(--purple)" : "var(--faint)" }}>
                                  {field === "hook" ? "Hook 🎣" : field === "body" ? "Body 📝" : "CTA 🎯"}
                                </p>
                                {isEditing ? (
                                  <textarea value={editDraft[field] ?? ""} onChange={e => setEditDraft(d => ({ ...d, [field]: e.target.value }))}
                                    style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 12, lineHeight: 1.6, resize: "vertical", minHeight: 60, fontFamily: "inherit" }} />
                                ) : (
                                  <p style={{ margin: 0, fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>{s[field] || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>ว่างเปล่า</span>}</p>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Full script */}
                          <div style={{ background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                            <p style={{ margin: "0 0 6px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>Full Script (เสียงอ่านตามนี้)</p>
                            {isEditing ? (
                              <textarea value={editDraft.full_script ?? ""} onChange={e => setEditDraft(d => ({ ...d, full_script: e.target.value }))}
                                style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13, lineHeight: 1.7, resize: "vertical", minHeight: 80, fontFamily: "inherit" }} />
                            ) : (
                              <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>{s.full_script || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>ว่างเปล่า</span>}</p>
                            )}
                          </div>

                          {/* Reviewer notes */}
                          {(isEditing || s.reviewer_notes) && (
                            <div style={{ background: "rgba(255,176,46,.05)", border: "1px solid rgba(255,176,46,.2)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                              <p style={{ margin: "0 0 6px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--warn)" }}>โน้ตจากผู้ตรวจ</p>
                              {isEditing ? (
                                <textarea value={editDraft.reviewer_notes ?? ""} onChange={e => setEditDraft(d => ({ ...d, reviewer_notes: e.target.value }))}
                                  placeholder="เพิ่มโน้ตหรือคำแนะนำ…" style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 12, lineHeight: 1.6, resize: "none", minHeight: 40, fontFamily: "inherit" }} />
                              ) : (
                                <p style={{ margin: 0, fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>{s.reviewer_notes}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Action buttons */}
                    {jobScripts.length > 0 && (
                      <div style={{ borderTop: "1px solid var(--gb)", paddingTop: 14, marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
                        {msg && (
                          <span style={{ fontSize: 12, color: msg.startsWith("✅") ? "var(--ok)" : msg.startsWith("❌") ? "var(--err)" : "var(--teal)", flex: 1 }}>
                            {msg.startsWith("❌") && <AlertCircle size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />}
                            {msg}
                          </span>
                        )}
                        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                          <button onClick={() => setActionMsg(prev => ({ ...prev, [job.id]: "" }))} style={{ padding: "8px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid var(--gb)", background: "var(--glass)", color: "var(--faint)", display: "flex", alignItems: "center", gap: 5 }}>
                            <RotateCcw size={11} /> สร้าง Script ใหม่
                          </button>
                          <button onClick={() => runVoiceAndRender(job.id, jobScripts[0].id)} disabled={busy} style={{
                            padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer",
                            border: "none", background: busy ? "var(--glass2)" : "linear-gradient(90deg,var(--teal),var(--blue))",
                            color: busy ? "var(--faint)" : "#06060A", display: "flex", alignItems: "center", gap: 6,
                            boxShadow: busy ? "none" : "0 4px 14px rgba(0,255,212,.3)",
                          }}>
                            {isVoicing ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> สร้างเสียง…</>
                            : isRendering ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Mix เสียง…</>
                            : <><Mic2 size={12} /> ใส่เสียง (ฟรี)</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatusBadge({ status, reviewStatus }: { status: string; reviewStatus: string }) {
  if (reviewStatus === "approved")      return <Badge color="var(--ok)" bg="rgba(34,212,153,.1)" icon={<CheckCircle2 size={10} />} label="อนุมัติ" />;
  if (reviewStatus === "rejected")      return <Badge color="var(--err)" bg="rgba(255,77,106,.1)" icon={<X size={10} />} label="ปฏิเสธ" />;
  if (reviewStatus === "review_needed") return <Badge color="var(--warn)" bg="rgba(255,176,46,.1)" icon={<Clock size={10} />} label="รอตรวจ" />;
  if (status === "processing")          return <Badge color="var(--teal)" bg="rgba(0,255,212,.08)" icon={<Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />} label="กำลังสร้าง" />;
  if (status === "completed")           return <Badge color="var(--blue)" bg="rgba(77,127,255,.1)" icon={<CheckCircle2 size={10} />} label="เสร็จสิ้น" />;
  return <Badge color="var(--faint)" bg="var(--glass)" icon={<Clock size={10} />} label={status} />;
}

function Badge({ color, bg, icon, label }: { color: string; bg: string; icon: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color, background: bg, border: `1px solid ${color}33`, padding: "3px 8px", borderRadius: 6 }}>
      {icon}{label}
    </span>
  );
}
