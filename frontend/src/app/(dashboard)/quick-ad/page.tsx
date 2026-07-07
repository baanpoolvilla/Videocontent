"use client";

import { useState, useRef } from "react";
import { Sparkles, Upload, Loader2, Download, Copy, Check, ImageIcon, X, Plus } from "lucide-react";
import { api, fileUrl } from "@/lib/api";

const VOICE_STYLES = [
  { id: "หญิง (ไทย)", label: "หญิง", sublabel: "Premwadee · นุ่มนวล", emoji: "👩" },
  { id: "ชาย (ไทย)",  label: "ชาย",  sublabel: "Niwat · มืออาชีพ",  emoji: "👔" },
];

const DURATIONS = [10, 15, 20, 30, 45, 60];
const MAX_IMAGES = 10; // matches video_service.render_video's image_urls[:10] cap

const STYLES = [
  { id: "warm", label: "Ken Burns", sublabel: "สีสันสดใส เหมาะทั่วไป" },
  { id: "editorial", label: "Editorial หรู", sublabel: "โทนมืดหรู + ป้ายชื่อสินค้า" },
];

type QuickAdResult = { video_url: string; script: string; voice_style: string; provider: string };
type PickedImage = { file: File; preview: string; kind: "image" | "video" };

export default function QuickAdPage() {
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [voiceStyle, setVoiceStyle] = useState(VOICE_STYLES[0].id);
  const [durationSec, setDurationSec] = useState(15);
  const [style, setStyle] = useState(STYLES[0].id);
  const [burnCaptions, setBurnCaptions] = useState(true);

  const [images, setImages] = useState<PickedImage[]>([]);

  const [step, setStep] = useState<"" | "uploading" | "generating">("");
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [result, setResult] = useState<QuickAdResult | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loading = step !== "";

  function pickImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    const picked = Array.from(files).slice(0, room).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      kind: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
    }));
    setImages((prev) => [...prev, ...picked]);
  }

  function removeImage(i: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  async function generate() {
    if (images.length === 0 || !productName.trim()) return;
    setError("");
    setResult(null);
    try {
      setStep("uploading");
      setUploadProgress({ done: 0, total: images.length });
      const imageUrls: string[] = [];
      for (const img of images) {
        const fd = new FormData();
        fd.append("file", img.file);
        fd.append("asset_type", img.kind);
        const upRes = await api.post("/assets/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        imageUrls.push(fileUrl(upRes.data.url));
        setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
      }

      setStep("generating");
      const startRes = await api.post("/quick-ad/start", {
        product_name: productName.trim(),
        description: description.trim(),
        image_urls: imageUrls,
        voice_style: voiceStyle,
        duration_sec: durationSec,
        style,
        burn_captions: burnCaptions,
      });
      const jobId = startRes.data.job_id;

      // Script + TTS + FFmpeg render can take well over a minute — poll instead of
      // one long blocking request (avoids reverse-proxy/CDN timeout limits).
      const MAX_ATTEMPTS = 120; // ~4 minutes at 2s intervals
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const jobRes = await api.get(`/quick-ad/job/${jobId}`);
        const job = jobRes.data;
        if (job.status === "done") {
          setResult({
            video_url: job.video_url,
            script: job.script,
            voice_style: job.voice_style,
            provider: job.provider,
          });
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error || "สร้างวิดีโอไม่สำเร็จ");
        }
      }
      throw new Error("สร้างวิดีโอนานเกินไป ลองใหม่อีกครั้ง");
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setError(msg);
    } finally {
      setStep("");
    }
  }

  function copyScript() {
    if (!result?.script) return;
    navigator.clipboard.writeText(result.script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const stepLabel =
    step === "uploading" ? `กำลังอัปโหลดรูป... (${uploadProgress.done}/${uploadProgress.total})`
    : step === "generating" ? "กำลังสร้างวิดีโอ (เขียนสคริปต์ + พากย์เสียง + เรนเดอร์)..."
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d14", padding: "32px 40px", color: "#e2e4ef" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(255,176,46,.12)", border: "1px solid rgba(255,176,46,.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Sparkles size={16} color="#FFB02E" />
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff" }}>Quick Ad</h1>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
          อัปโหลดรูปหรือวิดีโอสั้นๆ ได้สูงสุด {MAX_IMAGES} ไฟล์ กดครั้งเดียว ได้วิดีโอโฆษณาพร้อมเสียงพากย์และซับ — ไม่ต้องรอ AI สร้างวิดีโอ ต้นทุนแทบ 0 บาท
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
        {/* Left — inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Image upload */}
          <div style={{
            background: "#111116", border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 14, padding: "18px 20px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
                รูป / วิดีโอสั้นๆ
              </p>
              <span style={{ fontSize: 11, color: "#4b5563" }}>{images.length}/{MAX_IMAGES}</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => { pickImages(e.target.files); e.target.value = ""; }}
              style={{ display: "none" }}
            />

            {images.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  cursor: "pointer", borderRadius: 10, padding: "40px 20px", textAlign: "center",
                  border: "1.5px dashed rgba(255,255,255,.15)", background: "rgba(255,255,255,.02)",
                }}
              >
                <Upload size={28} color="#4b5563" style={{ marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>คลิกเพื่อเลือกรูปหรือวิดีโอสินค้า (เลือกได้หลายไฟล์)</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {images.map((img, i) => (
                  <div key={img.preview} className="qa-preview-wrap" style={{
                    position: "relative", borderRadius: 10, overflow: "hidden",
                    border: "1px solid rgba(255,255,255,.1)", aspectRatio: "1",
                  }}>
                    {img.kind === "video" ? (
                      <video src={img.preview} muted loop autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img.preview} alt={`รูป ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                      style={{
                        position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(0,0,0,.6)", border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                      }}
                    >
                      <X size={12} />
                    </button>
                    <span style={{
                      position: "absolute", bottom: 4, left: 4, fontSize: 9, fontWeight: 700,
                      padding: "2px 6px", borderRadius: 5, background: "rgba(0,0,0,.6)", color: "#fff",
                    }}>
                      {i + 1}{img.kind === "video" ? " 🎬" : ""}
                    </span>
                  </div>
                ))}
                {images.length < MAX_IMAGES && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      cursor: "pointer", borderRadius: 10, aspectRatio: "1",
                      border: "1.5px dashed rgba(255,255,255,.15)", background: "rgba(255,255,255,.02)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Plus size={20} color="#4b5563" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Product info */}
          <div style={{
            background: "#111116", border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 14, padding: "18px 20px",
          }}>
            <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
              ข้อมูลสินค้า
            </p>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="ชื่อสินค้า เช่น พูลวิลล่าพัทยา ริมทะเล"
              style={{
                width: "100%", padding: "10px 12px", marginBottom: 10,
                background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 8, color: "#e2e4ef", fontSize: 13, outline: "none", boxSizing: "border-box",
              }}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="รายละเอียดสั้นๆ (ไม่บังคับ) — จุดขาย, บรรยากาศ ฯลฯ"
              rows={3}
              style={{
                width: "100%", resize: "vertical", padding: "10px 12px",
                background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 8, color: "#e2e4ef", fontSize: 13, fontFamily: "inherit",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Video style */}
          <div style={{
            background: "#111116", border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 14, padding: "18px 20px",
          }}>
            <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
              รูปแบบวิดีโอ
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              {STYLES.map((s) => {
                const active = style === s.id;
                return (
                  <button key={s.id} onClick={() => setStyle(s.id)} style={{
                    padding: "12px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                    background: active ? "rgba(255,176,46,.1)" : "rgba(255,255,255,.03)",
                    border: `1.5px solid ${active ? "#FFB02E" : "rgba(255,255,255,.08)"}`,
                  }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: active ? "#FFB02E" : "#fff" }}>{s.label}</p>
                    <p style={{ margin: "1px 0 0", fontSize: 10, color: "#6b7280" }}>{s.sublabel}</p>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setBurnCaptions((v) => !v)}
              style={{
                marginTop: 14, width: "100%", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e4ef" }}>เบิร์นซับลงวิดีโอ</span>
              <span style={{
                position: "relative", width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                background: burnCaptions ? "#FFB02E" : "rgba(255,255,255,.15)", transition: "background .15s",
              }}>
                <span style={{
                  position: "absolute", top: 2, left: burnCaptions ? 18 : 2, width: 16, height: 16, borderRadius: "50%",
                  background: "#fff", transition: "left .15s",
                }} />
              </span>
            </button>
          </div>

          {/* Voice + duration */}
          <div style={{
            background: "#111116", border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 14, padding: "18px 20px",
          }}>
            <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
              เสียงพากย์
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 14 }}>
              {VOICE_STYLES.map((v) => {
                const active = voiceStyle === v.id;
                return (
                  <button key={v.id} onClick={() => setVoiceStyle(v.id)} style={{
                    padding: "12px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                    background: active ? "rgba(255,176,46,.1)" : "rgba(255,255,255,.03)",
                    border: `1.5px solid ${active ? "#FFB02E" : "rgba(255,255,255,.08)"}`,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 22 }}>{v.emoji}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: active ? "#FFB02E" : "#fff" }}>{v.label}</p>
                      <p style={{ margin: "1px 0 0", fontSize: 10, color: "#6b7280" }}>{v.sublabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
              ความยาว
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => setDurationSec(d)} style={{
                  padding: "8px 0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: durationSec === d ? "rgba(255,176,46,.12)" : "rgba(255,255,255,.04)",
                  border: `1px solid ${durationSec === d ? "#FFB02E" : "rgba(255,255,255,.08)"}`,
                  color: durationSec === d ? "#FFB02E" : "#9ca3af",
                }}>
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading || images.length === 0 || !productName.trim()}
            style={{
              padding: "14px 24px", borderRadius: 12, fontSize: 15, fontWeight: 800,
              background: loading || images.length === 0 || !productName.trim()
                ? "rgba(255,255,255,.06)"
                : "linear-gradient(135deg, #FFB02E, #FF6FB7)",
              border: "none", color: loading || images.length === 0 || !productName.trim() ? "#4b5563" : "#0d0d14",
              cursor: loading || images.length === 0 || !productName.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {loading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={18} />}
            {loading ? stepLabel : "สร้างวิดีโอ"}
          </button>

          {error && (
            <div style={{
              padding: 14, borderRadius: 10, fontSize: 13,
              background: "rgba(255,80,80,.08)", border: "1px solid rgba(255,80,80,.25)", color: "#FF5050",
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Right — result */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {result ? (
            <div style={{
              background: "#111116", border: "1px solid rgba(255,176,46,.2)",
              borderRadius: 14, padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "rgba(255,176,46,.15)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Sparkles size={13} color="#FFB02E" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#FFB02E" }}>วิดีโอพร้อมแล้ว</span>
              </div>

              <video
                src={fileUrl(result.video_url)}
                controls
                playsInline
                style={{ width: "100%", borderRadius: 8, background: "#000" }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280", marginTop: 12 }}>
                <span>Provider</span>
                <span style={{ color: "#9ca3af" }}>{result.provider}</span>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>สคริปต์ที่ AI เขียน</span>
                  <button onClick={copyScript} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: copied ? "#FFB02E" : "#6b7280", fontSize: 11,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p style={{
                  margin: 0, fontSize: 12, color: "#9ca3af", lineHeight: 1.7,
                  background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "10px 12px",
                }}>
                  {result.script}
                </p>
              </div>

              <a href={fileUrl(result.video_url)} download="quick-ad.mp4" style={{
                marginTop: 14, width: "100%", padding: "10px 0", borderRadius: 9, textDecoration: "none",
                background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)",
                color: "#9ca3af", fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <Download size={13} /> ดาวน์โหลด
              </a>
            </div>
          ) : (
            <div style={{
              background: "#111116", border: "1px dashed rgba(255,255,255,.08)",
              borderRadius: 14, padding: "48px 24px", textAlign: "center",
            }}>
              <ImageIcon size={36} color="#1f2937" style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>วิดีโอจะปรากฏที่นี่</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#374151" }}>
                เลือกรูป ใส่ชื่อสินค้า แล้วกด &quot;สร้างวิดีโอ&quot;
              </p>
            </div>
          )}

          <div style={{
            background: "rgba(255,176,46,.06)", border: "1px solid rgba(255,176,46,.15)",
            borderRadius: 12, padding: "14px 16px",
          }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#FFB02E" }}>💡 เกี่ยวกับโหมดนี้</p>
            <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11, color: "#6b7280", lineHeight: 1.8 }}>
              <li>ไม่เรียก AI สร้างวิดีโอ (Ken Burns เท่านั้น) — เร็วและต้นทุนแทบ 0 บาท</li>
              <li>AI เขียนสคริปต์ + พากย์เสียง + เบิร์นซับให้อัตโนมัติทั้งหมด</li>
              <li>เหมาะกับงานที่ต้องการความเร็ว มากกว่าคุณภาพภาพสูงสุด</li>
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .qa-preview-wrap:hover .qa-hover-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
