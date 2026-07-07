"use client";

import { useState, useRef } from "react";
import { Sparkles, Upload, Loader2, Download, Copy, Check, ImageIcon } from "lucide-react";
import { api, fileUrl } from "@/lib/api";

const VOICE_STYLES = [
  { id: "หญิง (ไทย)", label: "หญิง", sublabel: "Premwadee · นุ่มนวล", emoji: "👩" },
  { id: "ชาย (ไทย)",  label: "ชาย",  sublabel: "Niwat · มืออาชีพ",  emoji: "👔" },
];

const DURATIONS = [10, 15, 20, 30];

type QuickAdResult = { video_url: string; script: string; voice_style: string; provider: string };

export default function QuickAdPage() {
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [voiceStyle, setVoiceStyle] = useState(VOICE_STYLES[0].id);
  const [durationSec, setDurationSec] = useState(15);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");

  const [step, setStep] = useState<"" | "uploading" | "generating">("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<QuickAdResult | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loading = step !== "";

  function pickImage(file: File | undefined) {
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function generate() {
    if (!imageFile || !productName.trim()) return;
    setError("");
    setResult(null);
    try {
      setStep("uploading");
      const fd = new FormData();
      fd.append("file", imageFile);
      fd.append("asset_type", "image");
      const upRes = await api.post("/assets/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const imageUrl = fileUrl(upRes.data.url);

      setStep("generating");
      const res = await api.post("/quick-ad/generate", {
        product_name: productName.trim(),
        description: description.trim(),
        image_urls: [imageUrl],
        voice_style: voiceStyle,
        duration_sec: durationSec,
      });
      setResult(res.data);
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

  const stepLabel = step === "uploading" ? "กำลังอัปโหลดรูป..." : step === "generating" ? "กำลังสร้างวิดีโอ (เขียนสคริปต์ + พากย์เสียง + เรนเดอร์)..." : "";

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
          รูปเดียว กดครั้งเดียว ได้วิดีโอโฆษณาพร้อมเสียงพากย์และซับ — ไม่ต้องรอ AI สร้างวิดีโอ ต้นทุนแทบ 0 บาท
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
            <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
              รูปสินค้า
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => pickImage(e.target.files?.[0])}
              style={{ display: "none" }}
            />
            {imagePreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="qa-preview-wrap"
                style={{
                  cursor: "pointer", borderRadius: 10, overflow: "hidden",
                  border: "1px solid rgba(255,255,255,.1)", position: "relative",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="preview" style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }} />
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(0,0,0,.35)", opacity: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "opacity .15s", color: "#fff", fontSize: 13, fontWeight: 700,
                }} className="qa-hover-overlay">
                  เปลี่ยนรูป
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  cursor: "pointer", borderRadius: 10, padding: "40px 20px", textAlign: "center",
                  border: "1.5px dashed rgba(255,255,255,.15)", background: "rgba(255,255,255,.02)",
                }}
              >
                <Upload size={28} color="#4b5563" style={{ marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>คลิกเพื่อเลือกรูปสินค้า</p>
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
            <div style={{ display: "flex", gap: 8 }}>
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => setDurationSec(d)} style={{
                  padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
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
            disabled={loading || !imageFile || !productName.trim()}
            style={{
              padding: "14px 24px", borderRadius: 12, fontSize: 15, fontWeight: 800,
              background: loading || !imageFile || !productName.trim()
                ? "rgba(255,255,255,.06)"
                : "linear-gradient(135deg, #FFB02E, #FF6FB7)",
              border: "none", color: loading || !imageFile || !productName.trim() ? "#4b5563" : "#0d0d14",
              cursor: loading || !imageFile || !productName.trim() ? "not-allowed" : "pointer",
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
