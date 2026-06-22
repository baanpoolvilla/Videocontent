"use client";

import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import {
  Loader2, Copy, Check, Hash, ChevronDown, RefreshCw,
  Calendar, Clock, Send, Trash2, CheckCircle2, AlertCircle, X, Rocket,
} from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; category: string | null; }
interface Script { id: string; hook: string | null; body: string | null; cta: string | null; version: number; }
interface Job { id: string; product_id: string; status: string; created_at: string; }
interface PlatformAccount { id: string; platform: string; account_name: string; }
interface ScheduledPost { id: string; platform: string; scheduled_at: string; status: string; }

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

function buildCaption(s: Script) {
  const lines = [s.hook, s.cta].filter(Boolean);
  return `${lines.join("\n\n")}\n\n${POOL_VILLA_TAGS.join(" ")}`;
}

function CopyBtn({ text, label = "คัดลอก" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
      border: `1px solid ${copied ? "rgba(34,212,153,.4)" : "var(--gb)"}`,
      background: copied ? "rgba(34,212,153,.1)" : "var(--glass)", color: copied ? "var(--ok)" : "var(--faint)",
    }}>
      {copied ? <><Check size={11} /> คัดลอกแล้ว!</> : <><Copy size={11} /> {label}</>}
    </button>
  );
}

export default function PublishCenterPage() {
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [scripts, setScripts]   = useState<Record<string, Script[]>>({});
  const [selectedJob, setSelectedJob] = useState("");
  const [loading, setLoading]   = useState(true);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [datetime, setDatetime] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [saving, setSaving]     = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ platform: "tiktok", account_name: "" });

  const loadScheduled = async (jobId: string) => {
    try { const r = await api.get(`/schedule/posts/?job_id=${jobId}`); setScheduled(r.data); }
    catch { /* ignore */ }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [j, p, acc] = await Promise.all([api.get("/jobs/?limit=50"), api.get("/products/"), api.get("/schedule/platform-accounts/")]);
      const jobList: Job[] = j.data;
      setJobs(jobList);
      setAccounts(acc.data);
      const m: Record<string, Product> = {};
      for (const x of p.data) m[x.id] = x;
      setProducts(m);

      const completed = jobList.filter(jb => jb.status === "completed" || jb.status === "processing");
      const results = await Promise.allSettled(completed.map(jb => api.get(`/jobs/${jb.id}/scripts`)));
      const sm: Record<string, Script[]> = {};
      let first = "";
      results.forEach((res, i) => {
        if (res.status === "fulfilled" && res.value.data.length > 0) {
          sm[completed[i].id] = res.value.data;
          if (!first) first = completed[i].id;
        }
      });
      setScripts(sm);
      if (first) { setSelectedJob(first); await loadScheduled(first); }
      else if (jobList.length > 0) setSelectedJob(jobList[0].id);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedJob) loadScheduled(selectedJob); }, [selectedJob]);

  const toggle = (platform: string) => setSelected(prev => { const n = new Set(prev); n.has(platform) ? n.delete(platform) : n.add(platform); return n; });

  const job     = jobs.find(j => j.id === selectedJob);
  const product = job ? products[job.product_id] : null;
  const script  = selectedJob ? (scripts[selectedJob]?.[0] || null) : null;
  const caption = script ? buildCaption(script) : "";

  const handleSchedule = async () => {
    if (selected.size === 0 || !datetime || !selectedJob) return;
    setSaving(true);
    try {
      await api.post("/schedule/posts/", {
        content_job_id: selectedJob,
        platforms: [...selected],
        scheduled_at: new Date(datetime).toISOString(),
        caption, hashtags: POOL_VILLA_TAGS,
      });
      setSelected(new Set());
      await loadScheduled(selectedJob);
    } finally { setSaving(false); }
  };

  const handleAddAccount = async () => {
    if (!newAccount.account_name.trim()) return;
    await api.post("/schedule/platform-accounts/", newAccount);
    setNewAccount({ platform: "tiktok", account_name: "" });
    setAddingAccount(false);
    const r = await api.get("/schedule/platform-accounts/");
    setAccounts(r.data);
  };

  const cancelPost = async (id: string) => {
    if (!confirm("ยกเลิกตารางโพสต์นี้?")) return;
    await api.delete(`/schedule/posts/${id}`);
    await loadScheduled(selectedJob);
  };

  const statusIcon = (s: string) =>
    s === "published" ? <CheckCircle2 size={12} color="var(--ok)" /> :
    s === "failed"    ? <AlertCircle  size={12} color="var(--err)" /> :
                        <Clock        size={12} color="var(--warn)" />;

  const statusLabel: Record<string, string> = { scheduled: "รอโพสต์", publishing: "กำลังโพสต์", published: "โพสต์แล้ว", failed: "ล้มเหลว" };

  return (
    <div className="page-enter" style={{ padding: "28px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        06b · Publish
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, letterSpacing: "-.02em", background: "linear-gradient(90deg,var(--blue),var(--purple))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Publish Center
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--faint)" }}>เลือก Job → คัดลอก Caption → เลือก Platform → ตั้งเวลาโพสต์</p>
        </div>
        <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCw size={13} /> รีเฟรช</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--faint)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 300px", gap: 16, alignItems: "start" }}>

          {/* Col 1: Job selector */}
          <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 16, position: "sticky", top: 20 }}>
            <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>เลือก Job</p>
            <div style={{ position: "relative" }}>
              <select value={selectedJob} onChange={e => setSelectedJob(e.target.value)} className="cs-select" style={{ width: "100%" }}>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {scripts[j.id]?.length ? "✓ " : ""}{products[j.product_id]?.name || j.id.slice(0, 8)} · {new Date(j.created_at).toLocaleDateString("th-TH")}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} color="var(--faint)" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
            {product && (
              <div style={{ marginTop: 14 }}>
                {product.media_urls?.[0] && <img src={fileUrl(product.media_urls[0])} alt="" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 9, marginBottom: 8 }} />}
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700 }}>{product.name}</p>
                {product.category && <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>{product.category}</p>}
              </div>
            )}
            {/* Schedule list */}
            {scheduled.length > 0 && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--gb)", paddingTop: 12 }}>
                <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>ตารางโพสต์</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {scheduled.map(post => {
                    const m = PLATFORM_META[post.platform] || { label: post.platform, icon: "🌐", color: "var(--faint)" };
                    return (
                      <div key={post.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", borderRadius: 8, background: "rgba(255,255,255,.03)", border: "1px solid var(--gb)" }}>
                        <span style={{ fontSize: 14 }}>{m.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{m.label}</div>
                          <div style={{ fontSize: 10, color: "var(--faint)" }}>{new Date(post.scheduled_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>{statusIcon(post.status)}</div>
                        {post.status === "scheduled" && (
                          <button onClick={() => cancelPost(post.id)} style={{ padding: "3px 5px", borderRadius: 5, cursor: "pointer", background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "var(--err)" }}>
                            <Trash2 size={9} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Col 2: Caption + Script + Hashtags */}
          {!script ? (
            <div style={{ padding: 40, background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, textAlign: "center", color: "var(--faint)" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--dim)" }}>Job นี้ยังไม่มี Script</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>ไปที่หน้า Generate เพื่อสร้าง Script ก่อน</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Caption */}
              <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Caption สำเร็จรูป</h2>
                  <CopyBtn text={caption} label="คัดลอกทั้งหมด" />
                </div>
                <pre style={{ margin: 0, fontFamily: "inherit", fontSize: 13, lineHeight: 1.8, color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 10, padding: "12px 14px" }}>{caption}</pre>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--faint)" }}>{caption.length} ตัวอักษร</p>
              </div>

              {/* Script */}
              <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 18 }}>
                <h2 style={{ margin: "0 0 12px", fontSize: 13.5, fontWeight: 700 }}>Script (Ver. {script.version})</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8 }}>
                  {(["hook", "body", "cta"] as const).map(f => (
                    <div key={f} style={{ background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 10, padding: "12px 14px" }}>
                      <p style={{ margin: "0 0 5px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: f === "hook" ? "var(--teal)" : f === "cta" ? "var(--purple)" : "var(--faint)" }}>
                        {f === "hook" ? "🎣 Hook" : f === "body" ? "📝 Body" : "🎯 CTA"}
                      </p>
                      <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>{script[f] || <span style={{ opacity: .4, fontStyle: "italic" }}>ว่างเปล่า</span>}</p>
                      <CopyBtn text={script[f] || ""} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Hashtags */}
              <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}><Hash size={15} color="var(--teal)" /> Hashtags</h2>
                  <CopyBtn text={POOL_VILLA_TAGS.join(" ")} label="คัดลอก hashtag" />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {POOL_VILLA_TAGS.map(tag => (
                    <span key={tag} onClick={() => navigator.clipboard.writeText(tag)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.2)", color: "var(--teal)", cursor: "pointer" }}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Col 3: Schedule */}
          <div style={{ background: "var(--glass)", border: "1px solid rgba(77,127,255,.2)", borderRadius: 14, padding: 18, position: "sticky", top: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                <Rocket size={15} color="var(--blue)" /> โพสต์ / ตั้งเวลา
              </h2>
              <button onClick={() => setAddingAccount(v => !v)} style={{ padding: "4px 10px", borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: "pointer", background: "rgba(77,127,255,.08)", border: "1px solid rgba(77,127,255,.2)", color: "var(--blue)" }}>
                + บัญชี
              </button>
            </div>

            {addingAccount && (
              <div style={{ background: "rgba(77,127,255,.05)", border: "1px solid rgba(77,127,255,.15)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <select value={newAccount.platform} onChange={e => setNewAccount(p => ({ ...p, platform: e.target.value }))} className="cs-select">
                    {Object.entries(PLATFORM_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                  <input value={newAccount.account_name} onChange={e => setNewAccount(p => ({ ...p, account_name: e.target.value }))}
                    placeholder="@ชื่อบัญชี" style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 12.5, outline: "none" }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={handleAddAccount} style={{ flex: 1, padding: "7px", borderRadius: 8, cursor: "pointer", background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none", color: "#06060A", fontSize: 12, fontWeight: 800 }}>บันทึก</button>
                    <button onClick={() => setAddingAccount(false)} style={{ padding: "7px 10px", borderRadius: 8, cursor: "pointer", background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--faint)" }}><X size={12} /></button>
                  </div>
                </div>
              </div>
            )}

            {accounts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "var(--faint)", fontSize: 12 }}>
                กด "+ บัญชี" เพื่อเพิ่ม TikTok, Instagram ฯลฯ
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
                  {accounts.map(acct => {
                    const m = PLATFORM_META[acct.platform] || { label: acct.platform, icon: "🌐", color: "var(--faint)" };
                    const isOn = selected.has(acct.platform);
                    return (
                      <button key={acct.id} onClick={() => toggle(acct.platform)} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                        background: isOn ? `${m.color}18` : "var(--glass2)",
                        border: `1.5px solid ${isOn ? m.color + "60" : "var(--gb)"}`,
                      }}>
                        <span style={{ fontSize: 18 }}>{m.icon}</span>
                        <div style={{ textAlign: "left", flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isOn ? m.color : "var(--dim)" }}>{m.label}</div>
                          <div style={{ fontSize: 10, color: "var(--faint)" }}>{acct.account_name}</div>
                        </div>
                        {isOn && <Check size={13} color={m.color} />}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)", borderRadius: 9, padding: "8px 12px", marginBottom: 10 }}>
                  <Clock size={13} color="var(--faint)" />
                  <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} style={{ border: "none", background: "transparent", color: "var(--text)", fontSize: 12.5, outline: "none", flex: 1, colorScheme: "dark" }} />
                </div>

                <button onClick={handleSchedule} disabled={saving || selected.size === 0 || !script} style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  padding: "12px", borderRadius: 10, cursor: selected.size > 0 && script ? "pointer" : "not-allowed",
                  background: selected.size > 0 && script ? "linear-gradient(90deg,var(--blue),var(--purple))" : "var(--glass2)",
                  border: "none", color: selected.size > 0 && script ? "#fff" : "var(--faint)",
                  fontSize: 13.5, fontWeight: 800, opacity: saving ? .6 : 1,
                }}>
                  <Send size={14} strokeWidth={2.5} />
                  {saving ? "กำลังตั้งเวลา..." : `ตั้งเวลา${selected.size > 0 ? ` (${selected.size} platform)` : ""}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
