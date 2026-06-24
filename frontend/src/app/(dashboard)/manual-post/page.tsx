"use client";

import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Copy, Check, Download, Film, Loader2, ExternalLink, Play } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }
interface RenderVersion { id: string; final_video_url: string | null; status: string; }
interface Job { id: string; product_id: string; review_status: string; platform: string | null; created_at: string; }
interface Script { id: string; full_script: string | null; hook: string | null; }

const PLATFORMS = [
  { id: "tiktok",    label: "TikTok",    icon: "🎵", url: "https://www.tiktok.com/upload",          color: "#ff0050" },
  { id: "instagram", label: "Instagram", icon: "📸", url: "https://www.instagram.com",              color: "#c13584" },
  { id: "facebook",  label: "Facebook",  icon: "📘", url: "https://www.facebook.com/reels/create",  color: "#1877f2" },
  { id: "youtube",   label: "YouTube",   icon: "▶️", url: "https://studio.youtube.com/channel/UC/videos/upload", color: "#ff0000" },
];

function imgProxy(url: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return url.startsWith("/") ? `${base}/api/v1/files/${url.slice(1)}` : url;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <button onClick={copy} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
      border: `1px solid ${copied ? "rgba(34,212,153,.4)" : "var(--gb)"}`,
      background: copied ? "rgba(34,212,153,.1)" : "var(--glass)",
      color: copied ? "var(--ok)" : "var(--faint)", transition: "all .15s",
    }}>
      {copied ? <><Check size={10} /> คัดลอกแล้ว!</> : <><Copy size={10} /> คัดลอก</>}
    </button>
  );
}

export default function ManualPostPage() {
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [renders, setRenders]   = useState<Record<string, RenderVersion | null>>({});
  const [scripts, setScripts]   = useState<Record<string, Script | null>>({});
  const [loading, setLoading]   = useState(true);

  // per-job: selected platforms + copy state
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [opened, setOpened]     = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([api.get("/jobs/?limit=50"), api.get("/products/")]).then(async ([j, p]) => {
      const jData: Job[] = j.data.filter((j: Job) => j.review_status === "approved");
      setJobs(jData);
      const m: Record<string, Product> = {};
      for (const x of p.data) m[x.id] = x;
      setProducts(m);

      // init all jobs with all platforms selected
      const initSel: Record<string, Set<string>> = {};
      for (const job of jData) initSel[job.id] = new Set(PLATFORMS.map(p => p.id));
      setSelected(initSel);

      await Promise.all(jData.map(async job => {
        try {
          const [rRes, sRes] = await Promise.all([
            api.get(`/jobs/${job.id}/renders`),
            api.get(`/jobs/${job.id}/scripts`),
          ]);
          const completedRender = rRes.data.find((r: RenderVersion) => r.final_video_url);
          setRenders(prev => ({ ...prev, [job.id]: completedRender || null }));
          const approvedScript = sRes.data.find((s: Script) => s.full_script) || null;
          setScripts(prev => ({ ...prev, [job.id]: approvedScript }));
        } catch { /* skip */ }
      }));
    }).finally(() => setLoading(false));
  }, []);

  const togglePlatform = (jobId: string, platformId: string) => {
    setSelected(prev => {
      const s = new Set(prev[jobId] || []);
      if (s.has(platformId)) s.delete(platformId); else s.add(platformId);
      return { ...prev, [jobId]: s };
    });
  };

  const openSelected = (jobId: string, caption: string) => {
    const sel = selected[jobId] || new Set();
    navigator.clipboard.writeText(caption).catch(() => {});
    for (const pid of sel) {
      const p = PLATFORMS.find(x => x.id === pid);
      if (p) setTimeout(() => window.open(p.url, "_blank"), 0);
    }
    setOpened(prev => ({ ...prev, [jobId]: true }));
    setTimeout(() => setOpened(prev => ({ ...prev, [jobId]: false })), 3000);
  };

  const buildCaption = (prod: Product | undefined, script: Script | null) => {
    const name = prod?.name || "สินค้าของเรา";
    if (script?.full_script) return script.full_script + "\n\n#" + name.replace(/\s/g, "") + " #poolvillapattaya #TikTok #viral";
    if (script?.hook) return script.hook + "\n\n#" + name.replace(/\s/g, "") + " #poolvillapattaya #viral";
    return name + " — ดีแค่ลองดูสิ! 🔥\n#poolvillapattaya #TikTok #viral";
  };

  return (
    <div className="page-enter" style={{ padding: "28px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>10b · โพสต์เอง</p>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800 }}>โพสต์เอง</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>เลือก platform → กด เปิด Studio → วางคลิปและ caption ที่คัดลอกอัตโนมัติ</p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--faint)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} />
          กำลังโหลด…
        </div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 16 }}>
          <Film size={40} strokeWidth={1} style={{ margin: "0 auto 14px", display: "block", opacity: .25 }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dim)", margin: "0 0 6px" }}>ยังไม่มีวิดีโอที่อนุมัติแล้ว</p>
          <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>ไปที่หน้า อนุมัติ เพื่อ approve วิดีโอก่อน</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {jobs.map(job => {
            const prod     = products[job.product_id];
            const render   = renders[job.id];
            const script   = scripts[job.id];
            const caption  = buildCaption(prod, script ?? null);
            const videoUrl = render?.final_video_url ? imgProxy(render.final_video_url) : null;
            const sel      = selected[job.id] || new Set();
            const isOpened = opened[job.id];

            return (
              <div key={job.id} style={{
                background: "var(--glass)", border: "1px solid rgba(34,212,153,.15)",
                borderRadius: 16, overflow: "hidden",
              }}>
                {/* Top row: video preview + info + download */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, padding: "16px 20px", alignItems: "flex-start" }}>

                  {/* Video preview */}
                  <div style={{ width: 80, flexShrink: 0 }}>
                    {videoUrl ? (
                      <video
                        src={videoUrl}
                        style={{ width: 80, height: 142, borderRadius: 10, objectFit: "cover", background: "#000", display: "block" }}
                        muted autoPlay loop playsInline
                      />
                    ) : prod?.media_urls?.[0] ? (
                      <div style={{ position: "relative", width: 80, height: 142, borderRadius: 10, overflow: "hidden" }}>
                        <img src={fileUrl(prod.media_urls[0])} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)" }}>
                          <Play size={20} color="#fff" />
                        </div>
                      </div>
                    ) : (
                      <div style={{ width: 80, height: 142, borderRadius: 10, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Film size={20} style={{ opacity: .2 }} />
                      </div>
                    )}
                  </div>

                  {/* Job info */}
                  <div>
                    <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>{prod?.name || "ไม่ทราบสินค้า"}</p>
                    <p style={{ margin: "0 0 14px", fontSize: 11, color: "var(--ok)", fontWeight: 600 }}>
                      ✓ อนุมัติแล้ว · {new Date(job.created_at).toLocaleDateString("th-TH")}
                    </p>

                    {/* Platform selector */}
                    <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                      เลือก Platform ที่จะโพส
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {PLATFORMS.map(p => {
                        const active = sel.has(p.id);
                        return (
                          <button key={p.id} onClick={() => togglePlatform(job.id, p.id)} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "6px 12px", borderRadius: 10, cursor: "pointer",
                            border: `1.5px solid ${active ? p.color + "66" : "var(--gb)"}`,
                            background: active ? p.color + "18" : "transparent",
                            color: active ? p.color : "var(--faint)",
                            fontSize: 12, fontWeight: 700, transition: "all .15s",
                          }}>
                            <span style={{ fontSize: 15 }}>{p.icon}</span>
                            {p.label}
                            {active && <Check size={10} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Download */}
                  {videoUrl ? (
                    <a href={videoUrl} download style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                      background: "var(--glass)", border: "1px solid var(--gb)",
                      color: "var(--faint)", textDecoration: "none",
                    }}>
                      <Download size={13} /> ดาวน์โหลด
                    </a>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--faint)" }}>ยังไม่มีวิดีโอ</span>
                  )}
                </div>

                {/* Caption block */}
                <div style={{ borderTop: "1px solid var(--gb)", padding: "14px 20px", background: "rgba(0,0,0,.15)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                        Caption (จาก Script จริง)
                      </p>
                      <p style={{ margin: 0, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                        {caption}
                      </p>
                    </div>
                    <CopyBtn text={caption} />
                  </div>

                  {/* Action button */}
                  <button
                    onClick={() => sel.size > 0 && openSelected(job.id, caption)}
                    disabled={sel.size === 0}
                    style={{
                      width: "100%", padding: "12px 20px", borderRadius: 12,
                      cursor: sel.size > 0 ? "pointer" : "not-allowed",
                      border: "none",
                      background: sel.size > 0
                        ? "linear-gradient(90deg,var(--teal),var(--blue))"
                        : "var(--glass2)",
                      color: sel.size > 0 ? "#06060A" : "var(--faint)",
                      fontSize: 14, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      boxShadow: sel.size > 0 ? "0 4px 16px rgba(0,255,212,.25)" : "none",
                      transition: "all .15s",
                    }}>
                    {isOpened ? (
                      <><Check size={15} /> คัดลอก Caption + เปิด {sel.size} Studio แล้ว!</>
                    ) : (
                      <><ExternalLink size={15} />
                        {sel.size > 0
                          ? `เปิด Studio ${sel.size} Platform พร้อมกัน + คัดลอก Caption`
                          : "เลือก Platform ก่อน"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
