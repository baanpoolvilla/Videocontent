"use client";

import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Loader2, Copy, Check, Mic2, Hash, ChevronDown, RefreshCw } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; category: string | null; }
interface Script {
  id: string; hook: string | null; body: string | null; cta: string | null;
  full_script: string | null; version: number;
}
interface Job { id: string; product_id: string; status: string; review_status: string; created_at: string; }

const HASHTAG_POOL: Record<string, string[]> = {
  villa:     ["#PoolVilla", "#พูลวิลล่า", "#วิลล่าส่วนตัว", "#สระว่ายน้ำส่วนตัว", "#poolside", "#villalife", "#luxuryvilla", "#พักผ่อน", "#วันหยุด", "#เที่ยวไทย"],
  hotel:     ["#โรงแรม", "#ที่พัก", "#hotel", "#resort", "#ท่องเที่ยว", "#พักผ่อน", "#travelthailand", "#checkin"],
  travel:    ["#ท่องเที่ยว", "#travelthailand", "#เที่ยวไทย", "#travel", "#วันหยุด", "#tripthailand", "#ที่เที่ยว"],
  skincare:  ["#สกินแคร์", "#ผิวสวย", "#ครีมบำรุง", "#เซรั่ม", "#skincarethai", "#reviewสกินแคร์"],
  fashion:   ["#แฟชั่น", "#ootn", "#styleoftheday", "#แต่งตัว", "#fashionthai"],
  food:      ["#อาหาร", "#กินอะไรดี", "#อร่อย", "#foodreview", "#อาหารไทย"],
  default:   ["#TikTok", "#viral", "#review", "#แนะนำ", "#คุ้มค่า", "#ไอเดีย", "#ประสบการณ์"],
};

const POOL_VILLA_TAGS = [
  "#BananaPoolVilla", "#Pattaya", "#พัทยา", "#PoolVilla",
  "#วิลล่าส่วนตัว", "#สระว่ายน้ำส่วนตัว", "#พักผ่อน",
  "#เที่ยวพัทยา", "#travelthailand", "#luxuryvilla",
  "#poolside", "#villalife", "#วันหยุด", "#checkin",
];

function detectCategory(name: string, cat: string | null): string {
  const lower = (name + " " + (cat || "")).toLowerCase();
  if (lower.includes("villa") || lower.includes("pool") || lower.includes("วิลล่า")) return "villa";
  if (lower.includes("hotel") || lower.includes("resort") || lower.includes("โรงแรม")) return "hotel";
  if (lower.includes("travel") || lower.includes("trip") || lower.includes("ท่องเที่ยว")) return "travel";
  if (lower.includes("skin") || lower.includes("cream") || lower.includes("serum")) return "skincare";
  return cat?.toLowerCase() || "default";
}

function genHashtags(cat: string | null, name: string): string[] {
  const detected = detectCategory(name, cat);
  const base = HASHTAG_POOL[detected] || HASHTAG_POOL.default;
  const nameWords = name.split(/\s+/).slice(0, 2).map(w => `#${w.replace(/[^ก-๙a-zA-Z0-9]/g, "")}`).filter(w => w.length > 1);
  const combined = [...new Set([...nameWords, ...base, ...HASHTAG_POOL.default])].slice(0, 12);
  return combined;
}

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

export default function CaptionPage() {
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [scripts, setScripts] = useState<Record<string, Script[]>>({});
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [usePoolVilla, setUsePoolVilla] = useState(false);

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

      // Load scripts for all completed jobs in parallel, pick first with scripts
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

  useEffect(() => {
    if (selectedJob && !scripts[selectedJob]) fetchScripts(selectedJob);
  }, [selectedJob]);

  const job      = jobs.find(j => j.id === selectedJob);
  const product  = job ? products[job.product_id] : null;
  const jobScripts = selectedJob ? (scripts[selectedJob] || []) : [];
  const script   = jobScripts[0] || null;
  const hashtags = usePoolVilla
    ? POOL_VILLA_TAGS
    : product ? genHashtags(product.category, product.name) : HASHTAG_POOL.default;
  const caption  = script ? buildCaption(script, hashtags) : "";

  const jobsWithScripts = jobs.filter(j => scripts[j.id]?.length > 0);
  const hasScripts = jobsWithScripts.length > 0;

  return (
    <div className="page-enter" style={{ padding: "32px 40px", maxWidth: 920, margin: "0 auto" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        06 · Caption & Hashtag
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>Caption · Hashtag</h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--dim)" }}>สร้าง caption พร้อมใช้ — เลือก job แล้วคัดลอกไปโพสต์ได้เลย</p>
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
          <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 16 }}>
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
                ⚠️ jobs ยังไม่มี Script — ไปที่หน้า Generate เพื่อสร้าง Script ก่อน
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

            {/* Pool Villa hashtag toggle */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--gb)" }}>
              <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>Hashtag Mode</p>
              <div onClick={() => setUsePoolVilla(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{
                  width: 34, height: 19, borderRadius: 10, flexShrink: 0, position: "relative",
                  background: usePoolVilla ? "linear-gradient(90deg,var(--teal),var(--blue))" : "var(--glass2)",
                  transition: "background .2s",
                }}>
                  <div style={{
                    position: "absolute", top: 2, width: 15, height: 15, borderRadius: "50%",
                    left: usePoolVilla ? "auto" : 2, right: usePoolVilla ? 2 : "auto",
                    background: usePoolVilla ? "#06060A" : "var(--faint)", transition: "all .2s",
                  }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: usePoolVilla ? "var(--teal)" : "var(--dim)" }}>
                    🏊 Pool Villa Mode
                  </p>
                  <p style={{ margin: 0, fontSize: 10.5, color: "var(--faint)" }}>ใช้ hashtag Banana Pool Villa</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: caption builder */}
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
                  }}>{caption || "—"}</pre>
                  <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--faint)" }}>
                    {caption.length} ตัวอักษร
                  </p>
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
                      <Hash size={15} color="var(--teal)" />
                      Hashtags
                      {usePoolVilla && <span style={{ fontSize: 10.5, color: "var(--teal)", background: "rgba(0,255,212,.1)", border: "1px solid rgba(0,255,212,.2)", padding: "2px 8px", borderRadius: 6 }}>Pool Villa Mode</span>}
                    </h2>
                    <CopyBtn text={hashtags.join(" ")} label="คัดลอก hashtag" />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {hashtags.map(tag => (
                      <span key={tag} onClick={() => navigator.clipboard.writeText(tag)} style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.2)",
                        color: "var(--teal)", cursor: "pointer", transition: "background .15s",
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
