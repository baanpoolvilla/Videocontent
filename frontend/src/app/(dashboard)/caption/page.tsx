"use client";

import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import {
  Loader2, Copy, Check, Mic2, Hash, ChevronDown, RefreshCw,
  Calendar, Clock, Send, Trash2, CheckCircle2, AlertCircle, X,
} from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; category: string | null; }
interface Script {
  id: string; hook: string | null; body: string | null; cta: string | null;
  full_script: string | null; version: number;
}
interface Job { id: string; product_id: string; status: string; review_status: string; created_at: string; }
interface PlatformAccount { id: string; platform: string; account_name: string; is_active: boolean; }
interface ScheduledPost { id: string; platform: string; account_name?: string; scheduled_at: string; status: string; caption: string | null; }

const PLATFORM_META: Record<string, { label: string; icon: string; color: string }> = {
  tiktok:         { label: "TikTok",         icon: "🎵", color: "#FF004F" },
  instagram:      { label: "Instagram",      icon: "📸", color: "#E1306C" },
  facebook:       { label: "Facebook",       icon: "👥", color: "#1877F2" },
  youtube_shorts: { label: "YouTube Shorts", icon: "▶️", color: "#FF0000" },
  twitter:        { label: "Twitter / X",    icon: "𝕏",  color: "#1DA1F2" },
};

const POOL_VILLA_TAGS = [
  "#BananaPoolVilla", "#Pattaya", "#พัทยา", "#PoolVilla",
  "#วิลล่าส่วนตัว", "#สระว่ายน้ำส่วนตัว", "#พักผ่อน",
  "#เที่ยวพัทยา", "#travelthailand", "#luxuryvilla",
  "#poolside", "#villalife", "#วันหยุด", "#checkin",
];

function buildCaption(script: Script, hashtags: string[]): string {
  const lines = [script.hook, script.cta].filter(Boolean);
  return `${lines.join("\n\n")}\n\n${hashtags.join(" ")}`;
}

function CopyBtn({ text, label = "คัดลอก" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
      border: `1px solid ${copied ? "rgba(34,212,153,.4)" : "var(--gb)"}`,
      background: copied ? "rgba(34,212,153,.1)" : "var(--glass)",
      color: copied ? "var(--ok)" : "var(--faint)", transition: "all .15s",
    }}>
      {copied ? <><Check size={11} /> คัดลอกแล้ว!</> : <><Copy size={11} /> {label}</>}
    </button>
  );
}

function SchedulePanel({
  jobId, caption, hashtags,
}: { jobId: string; caption: string; hashtags: string[] }) {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [datetime, setDatetime] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ platform: "tiktok", account_name: "" });

  const loadAccounts = async () => {
    try {
      const r = await api.get("/schedule/platform-accounts/");
      setAccounts(r.data);
    } catch { /* ignore */ }
  };

  const loadScheduled = async () => {
    try {
      const r = await api.get(`/schedule/posts/?job_id=${jobId}`);
      setScheduled(r.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadAccounts(); loadScheduled(); }, [jobId]);

  const toggle = (platform: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(platform) ? next.delete(platform) : next.add(platform);
      return next;
    });
  };

  const handleSchedule = async () => {
    if (selected.size === 0 || !datetime) return;
    setSaving(true);
    try {
      await api.post("/schedule/posts/", {
        content_job_id: jobId,
        platforms: [...selected],
        scheduled_at: new Date(datetime).toISOString(),
        caption,
        hashtags,
      });
      setSelected(new Set());
      await loadScheduled();
    } finally { setSaving(false); }
  };

  const handleCancel = async (postId: string) => {
    if (!confirm("ยกเลิกตารางโพสต์นี้?")) return;
    await api.delete(`/schedule/posts/${postId}`);
    await loadScheduled();
  };

  const handleAddAccount = async () => {
    if (!newAccount.account_name.trim()) return;
    await api.post("/schedule/platform-accounts/", newAccount);
    setNewAccount({ platform: "tiktok", account_name: "" });
    setAddingAccount(false);
    await loadAccounts();
  };

  const statusIcon = (s: string) =>
    s === "published" ? <CheckCircle2 size={12} color="var(--ok)" /> :
    s === "failed" ? <AlertCircle size={12} color="var(--err)" /> :
    <Clock size={12} color="var(--warn)" />;

  const statusLabel: Record<string, string> = {
    scheduled: "รอโพสต์", publishing: "กำลังโพสต์", published: "โพสต์แล้ว", failed: "ล้มเหลว",
  };

  return (
    <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
          <Calendar size={15} color="var(--blue)" />
          ตั้งเวลาโพสต์
        </h2>
        <button onClick={() => setAddingAccount(v => !v)} style={{
          padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
          background: "rgba(77,127,255,.08)", border: "1px solid rgba(77,127,255,.2)", color: "var(--blue)",
        }}>
          + เพิ่มบัญชี
        </button>
      </div>

      {/* Add account form */}
      {addingAccount && (
        <div style={{ background: "rgba(77,127,255,.05)", border: "1px solid rgba(77,127,255,.15)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <p style={{ margin: "0 0 10px", fontSize: 11.5, fontWeight: 700, color: "var(--blue)" }}>เพิ่มบัญชี Social Media</p>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={newAccount.platform} onChange={e => setNewAccount(p => ({ ...p, platform: e.target.value }))}
              className="cs-select" style={{ flex: "0 0 160px" }}>
              {Object.entries(PLATFORM_META).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
            <input value={newAccount.account_name} onChange={e => setNewAccount(p => ({ ...p, account_name: e.target.value }))}
              placeholder="@ชื่อบัญชี เช่น @bananapoolvilla"
              style={{ flex: 1, background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 13, outline: "none" }} />
            <button onClick={handleAddAccount} style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer",
              background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none",
              color: "#06060A", fontSize: 12, fontWeight: 800,
            }}>บันทึก</button>
            <button onClick={() => setAddingAccount(false)} style={{
              padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--faint)",
            }}><X size={13} /></button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--faint)", fontSize: 12.5 }}>
          ยังไม่มีบัญชี — กด "เพิ่มบัญชี" ด้านบนเพื่อเชื่อม TikTok, Instagram ฯลฯ
        </div>
      ) : (
        <>
          {/* Platform checkboxes */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {accounts.map(acct => {
              const meta = PLATFORM_META[acct.platform] || { label: acct.platform, icon: "🌐", color: "var(--faint)" };
              const isOn = selected.has(acct.platform);
              return (
                <button key={acct.id} onClick={() => toggle(acct.platform)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                  background: isOn ? `${meta.color}18` : "var(--glass2)",
                  border: `1.5px solid ${isOn ? meta.color + "60" : "var(--gb)"}`,
                  transition: "all .15s",
                }}>
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isOn ? meta.color : "var(--dim)" }}>{meta.label}</div>
                    <div style={{ fontSize: 10, color: "var(--faint)" }}>{acct.account_name}</div>
                  </div>
                  {isOn && <Check size={12} color={meta.color} style={{ marginLeft: 4 }} />}
                </button>
              );
            })}
          </div>

          {/* Datetime + submit */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)", borderRadius: 9, padding: "8px 12px" }}>
              <Clock size={13} color="var(--faint)" />
              <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)}
                style={{ border: "none", background: "transparent", color: "var(--text)", fontSize: 13, outline: "none", flex: 1, colorScheme: "dark" }} />
            </div>
            <button onClick={handleSchedule} disabled={saving || selected.size === 0} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 20px", borderRadius: 10, cursor: selected.size === 0 ? "not-allowed" : "pointer",
              background: selected.size > 0 ? "linear-gradient(90deg,var(--teal),var(--blue))" : "var(--glass2)",
              border: "none", color: selected.size > 0 ? "#06060A" : "var(--faint)",
              fontSize: 13, fontWeight: 800, opacity: saving ? .6 : 1, transition: "all .2s",
            }}>
              <Send size={13} strokeWidth={2.5} />
              {saving ? "กำลังบันทึก..." : `ตั้งเวลา${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        </>
      )}

      {/* Scheduled list */}
      {scheduled.length > 0 && (
        <div style={{ marginTop: 18, borderTop: "1px solid var(--gb)", paddingTop: 14 }}>
          <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
            ตารางโพสต์ของ Job นี้
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {scheduled.map(post => {
              const meta = PLATFORM_META[post.platform] || { label: post.platform, icon: "🌐", color: "var(--faint)" };
              return (
                <div key={post.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 9,
                  background: "rgba(255,255,255,.03)", border: "1px solid var(--gb)",
                }}>
                  <span style={{ fontSize: 18 }}>{meta.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{meta.label}</div>
                    <div style={{ fontSize: 11, color: "var(--faint)" }}>
                      {new Date(post.scheduled_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--faint)" }}>
                    {statusIcon(post.status)} {statusLabel[post.status] || post.status}
                  </div>
                  {post.status === "scheduled" && (
                    <button onClick={() => handleCancel(post.id)} style={{
                      padding: "4px 8px", borderRadius: 7, cursor: "pointer",
                      background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)",
                      color: "var(--err)",
                    }}><Trash2 size={11} /></button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CaptionPage() {
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [scripts, setScripts]   = useState<Record<string, Script[]>>({});
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [loading, setLoading]   = useState(true);
  const [loadingScripts, setLoadingScripts] = useState(false);

  const fetchScripts = async (jobId: string) => {
    if (scripts[jobId]) return;
    setLoadingScripts(true);
    try {
      const r = await api.get(`/jobs/${jobId}/scripts`);
      setScripts(prev => ({ ...prev, [jobId]: r.data }));
    } finally { setLoadingScripts(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [j, p] = await Promise.all([api.get("/jobs/?limit=50"), api.get("/products/")]);
      const jobList: Job[] = j.data;
      setJobs(jobList);
      const m: Record<string, Product> = {};
      for (const x of p.data) m[x.id] = x;
      setProducts(m);

      const completed = jobList.filter(job => job.status === "completed" || job.status === "processing");
      const scriptResults = await Promise.allSettled(
        completed.map(job => api.get(`/jobs/${job.id}/scripts`))
      );
      const scriptMap: Record<string, Script[]> = {};
      let firstWithScripts = "";
      scriptResults.forEach((res, i) => {
        if (res.status === "fulfilled" && res.value.data.length > 0) {
          scriptMap[completed[i].id] = res.value.data;
          if (!firstWithScripts) firstWithScripts = completed[i].id;
        }
      });
      setScripts(scriptMap);
      if (firstWithScripts) setSelectedJob(firstWithScripts);
      else if (jobList.length > 0) setSelectedJob(jobList[0].id);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedJob && !scripts[selectedJob]) fetchScripts(selectedJob); }, [selectedJob]);

  const job        = jobs.find(j => j.id === selectedJob);
  const product    = job ? products[job.product_id] : null;
  const jobScripts = selectedJob ? (scripts[selectedJob] || []) : [];
  const script     = jobScripts[0] || null;
  const [hashtagText, setHashtagText] = useState(() => POOL_VILLA_TAGS.join(" "));
  const hashtags = hashtagText.split(/\s+/).filter(t => t.length > 0);
  const caption    = script ? buildCaption(script, hashtags) : "";
  const jobsWithScripts = jobs.filter(j => scripts[j.id]?.length > 0);
  const hasScripts = jobsWithScripts.length > 0;

  return (
    <div className="page-enter" style={{ padding: "32px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        06 · Caption & Hashtag
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>Caption · Hashtag</h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--dim)" }}>สร้าง caption พร้อมใช้ — เลือก job แล้วโพสต์หรือตั้งเวลาได้เลย</p>
        </div>
        <button onClick={load} className="btn btn-ghost btn-sm">
          <RefreshCw size={13} /> รีเฟรช
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--faint)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} />
          กำลังโหลด…
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18, alignItems: "start" }}>

          {/* Left: job selector */}
          <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 16, position: "sticky", top: 20 }}>
            <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
              เลือก Job ({jobs.length} รายการ)
            </p>
            {jobs.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>ยังไม่มี job — ไปสร้างคลิปก่อน</p>
            ) : (
              <div style={{ position: "relative" }}>
                <select value={selectedJob} onChange={e => setSelectedJob(e.target.value)} className="cs-select" style={{ width: "100%" }}>
                  {jobs.map(j => {
                    const hasScript = (scripts[j.id]?.length || 0) > 0;
                    const prodName = products[j.product_id]?.name || j.id.slice(0, 8);
                    return (
                      <option key={j.id} value={j.id}>
                        {hasScript ? "✓ " : ""}{prodName} · {new Date(j.created_at).toLocaleDateString("th-TH")}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown size={12} color="var(--faint)" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              </div>
            )}

            {!hasScripts && jobs.length > 0 && (
              <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--warn)", lineHeight: 1.6 }}>
                ⚠️ jobs ยังไม่มี Script
              </p>
            )}

            {product && (
              <div style={{ marginTop: 14 }}>
                {product.media_urls?.[0] && (
                  <img src={fileUrl(product.media_urls[0])} alt="" style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />
                )}
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700 }}>{product.name}</p>
                {product.category && <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>{product.category}</p>}
              </div>
            )}
          </div>

          {/* Right: content */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {loadingScripts ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--faint)" }}>
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px", display: "block" }} />
                โหลด script…
              </div>
            ) : !script ? (
              <div style={{ padding: 32, background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, textAlign: "center" }}>
                <Mic2 size={36} strokeWidth={1.2} style={{ margin: "0 auto 12px", display: "block", opacity: .25 }} />
                <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--dim)", margin: "0 0 6px" }}>Job นี้ยังไม่มี Script</p>
                <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>
                  {hasScripts ? "เลือก Job อื่นที่มี ✓ ด้านซ้าย" : "ไปที่หน้า Generate เพื่อสร้าง Script ก่อน"}
                </p>
              </div>
            ) : (
              <>
                {/* Caption preview */}
                <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Caption สำเร็จรูป</h2>
                    <CopyBtn text={caption} label="คัดลอกทั้งหมด" />
                  </div>
                  <pre style={{
                    margin: 0, fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.8,
                    color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 10, padding: "14px 16px",
                  }}>{caption}</pre>
                  <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--faint)" }}>{caption.length} ตัวอักษร</p>
                </div>

                {/* Script breakdown */}
                <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 18 }}>
                  <h2 style={{ margin: "0 0 12px", fontSize: 13.5, fontWeight: 700 }}>Script (Ver. {script.version})</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8 }}>
                    {(["hook", "body", "cta"] as const).map(field => (
                      <div key={field} style={{ background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 10, padding: "12px 14px" }}>
                        <p style={{ margin: "0 0 5px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em",
                          color: field === "hook" ? "var(--teal)" : field === "cta" ? "var(--purple)" : "var(--faint)" }}>
                          {field === "hook" ? "🎣 Hook" : field === "body" ? "📝 Body" : "🎯 CTA"}
                        </p>
                        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
                          {script[field] || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>ว่างเปล่า</span>}
                        </p>
                        <CopyBtn text={script[field] || ""} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hashtags */}
                <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                      <Hash size={15} color="var(--teal)" /> Hashtags
                    </h2>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setHashtagText(POOL_VILLA_TAGS.join(" "))} style={{
                        padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                        border: "1px solid var(--gb)", background: "var(--glass)", color: "var(--faint)",
                      }}>รีเซ็ต</button>
                      <CopyBtn text={hashtags.join(" ")} label="คัดลอก hashtag" />
                    </div>
                  </div>
                  <textarea
                    value={hashtagText}
                    onChange={e => setHashtagText(e.target.value)}
                    placeholder="#hashtag1 #hashtag2 ..."
                    rows={3}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 10,
                      padding: "12px 14px", color: "var(--text)", fontSize: 13,
                      resize: "vertical", lineHeight: 1.7, outline: "none",
                    }}
                  />
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--faint)" }}>{hashtags.length} hashtag · แก้ไขได้โดยตรง</p>
                </div>

                {/* Schedule panel */}
                <SchedulePanel jobId={selectedJob} caption={caption} hashtags={hashtags} />
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
