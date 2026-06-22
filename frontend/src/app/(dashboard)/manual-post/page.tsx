"use client";

import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Upload, Copy, Check, Download, Film, Loader2, ExternalLink } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }
interface RenderVersion { id: string; content_job_id: string; version_label: string | null; final_video_url: string | null; status: string; }
interface Job { id: string; product_id: string; review_status: string; platform: string | null; created_at: string; }

const PLATFORMS = [
  { id: "tiktok",    label: "TikTok",    icon: "🎵", url: "https://www.tiktok.com/upload", color: "#ff0050" },
  { id: "instagram", label: "Instagram", icon: "📸", url: "https://www.instagram.com",     color: "#c13584" },
  { id: "facebook",  label: "Facebook",  icon: "📘", url: "https://www.facebook.com",      color: "#1877f2" },
  { id: "youtube",   label: "YouTube",   icon: "▶️", url: "https://studio.youtube.com",    color: "#ff0000" },
];

function CopyBtn({ text, label = "คัดลอก" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <button onClick={copy} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
      border: `1px solid ${copied ? "rgba(34,212,153,.4)" : "var(--gb)"}`,
      background: copied ? "rgba(34,212,153,.1)" : "var(--glass)",
      color: copied ? "var(--ok)" : "var(--faint)", transition: "all .15s",
    }}>
      {copied ? <><Check size={11} /> คัดลอกแล้ว!</> : <><Copy size={11} /> {label}</>}
    </button>
  );
}

export default function ManualPostPage() {
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [renders, setRenders]   = useState<Record<string, RenderVersion[]>>({});
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([api.get("/jobs/?limit=50"), api.get("/products/")]).then(async ([j, p]) => {
      const jData: Job[] = j.data.filter((j: Job) => j.review_status === "approved");
      setJobs(jData);
      const m: Record<string, Product> = {};
      for (const x of p.data) m[x.id] = x;
      setProducts(m);
      await Promise.all(jData.map(async job => {
        try {
          const r = await api.get(`/jobs/${job.id}/renders`);
          if (r.data.length > 0) setRenders(prev => ({ ...prev, [job.id]: r.data }));
        } catch { /* skip */ }
      }));
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-enter" style={{ padding: "32px 40px", maxWidth: 900, margin: "0 auto" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>10b · โพสต์เอง</p>
      <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>โพสต์เอง</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>ดาวน์โหลดวิดีโอที่อนุมัติแล้ว พร้อม caption และ hashtag สำหรับโพสต์ด้วยตัวเอง</p>

      {/* Platform shortcuts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 28 }}>
        {PLATFORMS.map(p => (
          <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{
            textDecoration: "none", padding: "14px 16px", borderRadius: 14,
            background: "var(--glass)", border: "1px solid var(--gb)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            transition: "border-color .15s", cursor: "pointer",
          }}>
            <span style={{ fontSize: 22 }}>{p.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{p.label}</span>
            <span style={{ fontSize: 10, color: "var(--faint)", display: "flex", alignItems: "center", gap: 3 }}>
              <ExternalLink size={9} /> เปิด Studio
            </span>
          </a>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--faint)" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {jobs.map(job => {
            const prod = products[job.product_id];
            const jobRenders = renders[job.id] || [];
            const rv = jobRenders.find(r => r.final_video_url) || null;

            return (
              <div key={job.id} style={{ background: "var(--glass)", border: "1px solid rgba(34,212,153,.15)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, padding: "16px 20px", alignItems: "center" }}>
                  {/* Thumbnail */}
                  {prod?.media_urls?.[0] ? (
                    <img src={fileUrl(prod.media_urls[0])} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 10, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Film size={20} style={{ opacity: .2 }} />
                    </div>
                  )}

                  {/* Info */}
                  <div>
                    <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700 }}>{prod?.name || "ไม่ทราบสินค้า"}</p>
                    <p style={{ margin: 0, fontSize: 11, color: "var(--ok)", fontWeight: 600 }}>
                      ✓ อนุมัติแล้ว · {new Date(job.created_at).toLocaleDateString("th-TH")}
                    </p>
                  </div>

                  {/* Download */}
                  {rv?.final_video_url ? (
                    <a href={fileUrl(rv.final_video_url)} download style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 800,
                      background: "linear-gradient(90deg,var(--teal),var(--blue))",
                      color: "#06060A", textDecoration: "none",
                    }}>
                      <Download size={14} /> ดาวน์โหลด
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--faint)" }}>ยังไม่มีวิดีโอ</span>
                  )}
                </div>

                {/* Caption block */}
                <div style={{ borderTop: "1px solid var(--gb)", padding: "14px 20px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                      Caption (ตัวอย่าง)
                    </p>
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.7 }}>
                      {prod?.name || "สินค้าของเรา"} — ดีแค่ลองดูสิ! 🔥{"\n"}
                      #สินค้าดี #TikTok #viral
                    </p>
                  </div>
                  <CopyBtn text={`${prod?.name || "สินค้าของเรา"} — ดีแค่ลองดูสิ! 🔥\n#สินค้าดี #TikTok #viral`} label="คัดลอก Caption" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(0,255,212,.04)", border: "1px solid rgba(0,255,212,.12)", borderRadius: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--dim)", lineHeight: 1.65 }}>
          <Upload size={12} style={{ verticalAlign: "middle", marginRight: 6 }} color="var(--teal)" />
          ขั้นตอน: ดาวน์โหลดวิดีโอ → คัดลอก Caption → เปิด Studio ของแต่ละแพลตฟอร์ม → อัปโหลดและวางข้อความ
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
