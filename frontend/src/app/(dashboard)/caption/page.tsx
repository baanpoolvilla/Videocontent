"use client";

import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Loader2, Copy, Check, Mic2, Hash, ChevronDown } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; category: string | null; }
interface Script {
  id: string; hook: string | null; body: string | null; cta: string | null;
  full_script: string | null; version: number;
}
interface Job { id: string; product_id: string; status: string; created_at: string; }

const HASHTAG_POOL: Record<string, string[]> = {
  skincare:  ["#สกินแคร์", "#ผิวสวย", "#ครีมบำรุง", "#เซรั่ม", "#skincarethai", "#reviewสกินแคร์"],
  fashion:   ["#แฟชั่น", "#ootn", "#styleoftheday", "#แต่งตัว", "#fashionthai"],
  food:      ["#อาหาร", "#กินอะไรดี", "#อร่อย", "#foodreview", "#อาหารไทย"],
  beauty:    ["#เมคอัพ", "#แต่งหน้า", "#beauty", "#lipstick", "#beautyreview"],
  default:   ["#TikTok", "#viral", "#review", "#แนะนำ", "#สินค้าดี", "#คุ้มค่า", "#ต้องมี", "#ไอเดีย"],
};

function genHashtags(cat: string | null, name: string): string[] {
  const base = HASHTAG_POOL[cat?.toLowerCase() || "default"] || HASHTAG_POOL.default;
  const word = name.split(" ").slice(0, 2).map(w => `#${w.replace(/[^ก-๙a-zA-Z0-9]/g, "")}`).filter(Boolean);
  return [...new Set([...word, ...base, ...HASHTAG_POOL.default])].slice(0, 10);
}

function buildCaption(script: Script, hashtags: string[]): string {
  const hook = script.hook || "";
  const cta  = script.cta  || "";
  return `${hook}\n\n${cta}\n\n${hashtags.join(" ")}`;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <button onClick={copy} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
      border: `1px solid ${copied ? "rgba(34,212,153,.4)" : "var(--gb)"}`,
      background: copied ? "rgba(34,212,153,.1)" : "var(--glass)",
      color: copied ? "var(--ok)" : "var(--faint)", transition: "all .15s",
    }}>
      {copied ? <><Check size={11} /> คัดลอกแล้ว!</> : <><Copy size={11} /> คัดลอก</>}
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

  useEffect(() => {
    Promise.all([api.get("/jobs/?limit=30"), api.get("/products/")]).then(([j, p]) => {
      setJobs(j.data);
      const m: Record<string, Product> = {};
      for (const x of p.data) m[x.id] = x;
      setProducts(m);
      if (j.data.length > 0) setSelectedJob(j.data[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedJob) return;
    if (scripts[selectedJob]) return;
    setLoadingScripts(true);
    api.get(`/jobs/${selectedJob}/scripts`).then(r => {
      setScripts(prev => ({ ...prev, [selectedJob]: r.data }));
    }).finally(() => setLoadingScripts(false));
  }, [selectedJob]);

  const job     = jobs.find(j => j.id === selectedJob);
  const product = job ? products[job.product_id] : null;
  const jobScripts = selectedJob ? (scripts[selectedJob] || []) : [];
  const script  = jobScripts[0] || null;
  const hashtags = product ? genHashtags(product.category, product.name) : HASHTAG_POOL.default;
  const caption  = script ? buildCaption(script, hashtags) : "";

  return (
    <div className="page-enter" style={{ padding: "32px 40px", maxWidth: 920, margin: "0 auto" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        06 · Caption & Hashtag
      </p>
      <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>Caption · Hashtag · เสียง</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>สร้าง caption และ hashtag พร้อมใช้งานสำหรับแต่ละ job</p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--faint)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} />
          กำลังโหลด…
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18, alignItems: "start" }}>

          {/* Left: job selector */}
          <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 16 }}>
            <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>เลือก Job</p>
            {jobs.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>ยังไม่มี job — ไปสร้างคลิปก่อน</p>
            ) : (
              <div style={{ position: "relative" }}>
                <select
                  value={selectedJob}
                  onChange={e => setSelectedJob(e.target.value)}
                  className="cs-select"
                  style={{ width: "100%" }}
                >
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {products[j.product_id]?.name || j.id.slice(0, 8)} · {new Date(j.created_at).toLocaleDateString("th-TH")}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} color="var(--faint)" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              </div>
            )}

            {product && (
              <div style={{ marginTop: 14 }}>
                {product.media_urls?.[0] && (
                  <img src={fileUrl(product.media_urls[0])} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />
                )}
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700 }}>{product.name}</p>
                {product.category && <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>{product.category}</p>}
              </div>
            )}
          </div>

          {/* Right: caption builder */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {loadingScripts ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--faint)" }}>
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px", display: "block" }} />
                โหลด script…
              </div>
            ) : !script ? (
              <div style={{ padding: 24, background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, textAlign: "center" }}>
                <Mic2 size={32} strokeWidth={1.2} style={{ margin: "0 auto 10px", display: "block", opacity: .3 }} />
                <p style={{ fontSize: 13, color: "var(--dim)", margin: 0 }}>ยังไม่มี Script — ไปที่หน้า Generate เพื่อสร้างก่อน</p>
              </div>
            ) : (
              <>
                {/* Caption preview */}
                <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Caption สำเร็จรูป</h2>
                    <CopyBtn text={caption} />
                  </div>
                  <pre style={{
                    margin: 0, fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.75,
                    color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 10, padding: "14px 16px",
                  }}>{caption || "—"}</pre>
                </div>

                {/* Script breakdown */}
                <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, padding: 18 }}>
                  <h2 style={{ margin: "0 0 12px", fontSize: 13.5, fontWeight: 700 }}>Script (Ver. {script.version})</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8 }}>
                    {(["hook", "body", "cta"] as const).map(field => (
                      <div key={field} style={{ background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 10, padding: "12px 14px" }}>
                        <p style={{ margin: "0 0 5px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: field === "hook" ? "var(--teal)" : field === "cta" ? "var(--purple)" : "var(--faint)" }}>
                          {field === "hook" ? "Hook" : field === "body" ? "Body" : "CTA"}
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
                          {script[field] || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>ว่างเปล่า</span>}
                        </p>
                        <div style={{ marginTop: 8 }}><CopyBtn text={script[field] || ""} /></div>
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
                    <CopyBtn text={hashtags.join(" ")} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {hashtags.map(tag => (
                      <span key={tag} style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.2)",
                        color: "var(--teal)", cursor: "pointer",
                      }} onClick={() => navigator.clipboard.writeText(tag)}>
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
