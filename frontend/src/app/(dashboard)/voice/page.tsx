"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic2, Download, Loader2, Volume2, Copy, Check, Film, BookmarkPlus } from "lucide-react";
import { api } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API = `${BASE}/api/v1`;

// Storage paths (/assets/...) must go through the files proxy endpoint
function toAudioUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${BASE}/api/v1/files${path}`;
}

const VOICE_STYLES = [
  { id: "หญิง (ไทย)",   label: "หญิง",   sublabel: "Premwadee · นุ่มนวล", emoji: "👩" },
  { id: "ชาย (ไทย)",    label: "ชาย",    sublabel: "Niwat · มืออาชีพ",   emoji: "👔" },
  { id: "หญิง 2 (ไทย)", label: "หญิง 2", sublabel: "Achara · สดใส",       emoji: "✨" },
];

const SAMPLE_TEXTS = [
  "วิลล่าพูลส่วนตัว วิวทะเล บรรยากาศหรูหรา เหมาะสำหรับการพักผ่อนที่ต้องการความเป็นส่วนตัว",
  "ราคาพิเศษสำหรับการจองล่วงหน้า 30 วัน รับส่วนลด 20% พร้อมอาหารเช้าฟรี",
  "สระน้ำอินฟินิตี้ วิวพระอาทิตย์ตก ห้องนอนสุดหรู เตียงใหญ่ เปิดประตูสู่ธรรมชาติ",
];

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function VoicePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(VOICE_STYLES[0].id);
  const [lang, setLang] = useState("th");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; characters_used: number; provider: string; voice_style?: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function saveToLibrary() {
    if (!result) return;
    setSaving(true);
    try {
      const name = text.trim().slice(0, 50) || "เสียงพากย์";
      await api.post("/audio-assets/", {
        name,
        url: result.url,
        voice_style: voice,
        characters_used: result.characters_used,
        script_text: text.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSaved(false);
    try {
      const res = await fetch(`${API}/voice/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ text: text.trim(), voice_style: voice, lang }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  function copyUrl() {
    if (!result?.url) return;
    navigator.clipboard.writeText(toAudioUrl(result.url));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const charsLeft = 5000 - text.length;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d14", padding: "32px 40px", color: "#e2e4ef" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(0,255,212,.12)", border: "1px solid rgba(0,255,212,.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Mic2 size={16} color="#00FFD4" />
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff" }}>Voice Generator</h1>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
          สร้างเสียงพากย์ AI สำหรับวิดีโอ — รองรับภาษาไทยและอังกฤษ
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

        {/* Left — text input */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Voice selector */}
          <div style={{
            background: "#111116", border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 14, padding: "18px 20px",
          }}>
            <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
              เลือกเสียง
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              {VOICE_STYLES.map((v) => {
                const active = voice === v.id;
                return (
                  <button key={v.id} onClick={() => setVoice(v.id)} style={{
                    padding: "12px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                    background: active ? "rgba(0,255,212,.1)" : "rgba(255,255,255,.03)",
                    border: `1.5px solid ${active ? "#00FFD4" : "rgba(255,255,255,.08)"}`,
                    transition: "all .15s",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 22 }}>{v.emoji}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: active ? "#00FFD4" : "#fff" }}>
                        {v.label}
                      </p>
                      <p style={{ margin: "1px 0 0", fontSize: 10, color: "#6b7280" }}>{v.sublabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Lang toggle */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {["th","en"].map((l) => (
                <button key={l} onClick={() => setLang(l)} style={{
                  padding: "6px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: lang === l ? "rgba(0,255,212,.12)" : "rgba(255,255,255,.04)",
                  border: `1px solid ${lang === l ? "#00FFD4" : "rgba(255,255,255,.08)"}`,
                  color: lang === l ? "#00FFD4" : "#9ca3af",
                }}>
                  {l === "th" ? "🇹🇭 ภาษาไทย" : "🇺🇸 English"}
                </button>
              ))}
            </div>
          </div>

          {/* Text input */}
          <div style={{
            background: "#111116", border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 14, padding: "18px 20px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
                ข้อความ
              </p>
              <span style={{ fontSize: 11, color: charsLeft < 500 ? "#FF5050" : "#4b5563" }}>
                {charsLeft.toLocaleString()} ตัวอักษรที่เหลือ
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={5000}
              rows={8}
              placeholder="พิมพ์ข้อความที่ต้องการแปลงเป็นเสียง..."
              style={{
                width: "100%", resize: "vertical", padding: "12px 14px",
                background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 10, color: "#e2e4ef", fontSize: 14, lineHeight: 1.7,
                fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                minHeight: 160,
              }}
            />

            {/* Sample text buttons */}
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#4b5563" }}>ตัวอย่างข้อความ:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {SAMPLE_TEXTS.map((s, i) => (
                  <button key={i} onClick={() => setText(s)} style={{
                    padding: "7px 10px", borderRadius: 7, cursor: "pointer", textAlign: "left",
                    background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
                    color: "#9ca3af", fontSize: 11, lineHeight: 1.5,
                  }}>
                    {s.length > 80 ? s.slice(0, 80) + "…" : s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading || !text.trim()}
            style={{
              padding: "14px 24px", borderRadius: 12, fontSize: 15, fontWeight: 800,
              background: loading || !text.trim()
                ? "rgba(255,255,255,.06)"
                : "linear-gradient(135deg, #00FFD4, #4D7FFF)",
              border: "none", color: loading || !text.trim() ? "#4b5563" : "#0d0d14",
              cursor: loading || !text.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all .15s",
            }}
          >
            {loading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Volume2 size={18} />}
            {loading ? "กำลังสร้างเสียง..." : "สร้างเสียงพากย์"}
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

          {/* Provider info */}
          <div style={{
            background: "#111116", border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 14, padding: "18px 20px",
          }}>
            <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
              AI Model
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,.04)",
              }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>Edge TTS (Microsoft)</span>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "rgba(0,255,212,.1)", color: "#00FFD4" }}>
                  Primary
                </span>
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,.04)",
              }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>gTTS (Google)</span>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,.06)", color: "#6b7280" }}>
                  Fallback
                </span>
              </div>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 11, color: "#4b5563", lineHeight: 1.6 }}>
              เสียงไทย native — Premwadee / Niwat / Achara
            </p>
          </div>

          {/* Audio result */}
          {result ? (
            <div style={{
              background: "#111116", border: "1px solid rgba(0,255,212,.2)",
              borderRadius: 14, padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "rgba(0,255,212,.15)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Volume2 size={13} color="#00FFD4" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#00FFD4" }}>เสียงพร้อมแล้ว</span>
              </div>

              {/* Audio player */}
              <audio
                ref={audioRef}
                src={toAudioUrl(result.url)}
                controls
                style={{ width: "100%", borderRadius: 8 }}
              />

              {/* Meta */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280" }}>
                  <span>Provider</span>
                  <span style={{ color: "#9ca3af", textTransform: "capitalize" }}>{result.provider}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280" }}>
                  <span>ตัวอักษร</span>
                  <span style={{ color: "#9ca3af" }}>{result.characters_used.toLocaleString()} chars</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280" }}>
                  <span>เสียง</span>
                  <span style={{ color: "#9ca3af" }}>{result.voice_style ?? voice}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                {/* บันทึกลงคลัง */}
                <button onClick={saveToLibrary} disabled={saving || saved} style={{
                  width: "100%", padding: "11px 0", borderRadius: 9, cursor: saving ? "wait" : "pointer",
                  background: saved ? "rgba(0,255,212,.15)" : "rgba(255,176,46,.12)",
                  border: `1px solid ${saved ? "rgba(0,255,212,.4)" : "rgba(255,176,46,.3)"}`,
                  color: saved ? "#00FFD4" : "#ffb02e", fontSize: 13, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                }}>
                  {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : saved ? <Check size={13} /> : <BookmarkPlus size={13} />}
                  {saved ? "บันทึกแล้ว!" : saving ? "กำลังบันทึก..." : "บันทึกลงคลัง"}
                </button>
                {/* ใส่ลงวิดีโอ */}
                <button
                  onClick={() => router.push(`/preview?audio_url=${encodeURIComponent(toAudioUrl(result.url))}`)}
                  style={{
                    width: "100%", padding: "10px 0", borderRadius: 9, cursor: "pointer",
                    background: "linear-gradient(135deg, rgba(0,255,212,.15), rgba(77,127,255,.15))",
                    border: "1px solid rgba(0,255,212,.3)",
                    color: "#00FFD4", fontSize: 13, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  }}
                >
                  <Film size={13} /> ใส่ลงวิดีโอ →
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <a href={toAudioUrl(result.url)} download="voiceover.mp3" style={{
                    flex: 1, padding: "8px 0", borderRadius: 9, textDecoration: "none",
                    background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)",
                    color: "#9ca3af", fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <Download size={13} /> ดาวน์โหลด
                  </a>
                  <button onClick={copyUrl} style={{
                    padding: "8px 14px", borderRadius: 9, cursor: "pointer",
                    background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)",
                    color: copied ? "#00FFD4" : "#9ca3af", fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "Copied!" : "Copy URL"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              background: "#111116", border: "1px dashed rgba(255,255,255,.08)",
              borderRadius: 14, padding: "48px 24px", textAlign: "center",
            }}>
              <Volume2 size={36} color="#1f2937" style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>
                เสียงจะปรากฏที่นี่
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#374151" }}>
                พิมพ์ข้อความแล้วกด "สร้างเสียงพากย์"
              </p>
            </div>
          )}

          {/* Tips */}
          <div style={{
            background: "rgba(77,127,255,.06)", border: "1px solid rgba(77,127,255,.15)",
            borderRadius: 12, padding: "14px 16px",
          }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#4D7FFF" }}>💡 เคล็ดลับ</p>
            <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11, color: "#6b7280", lineHeight: 1.8 }}>
              <li>ข้อความ 1 นาที ≈ 130–150 คำ (ภาษาไทย)</li>
              <li>เพิ่มเครื่องหมาย , และ . เพื่อหยุดพักเสียง</li>
              <li>ใช้เสียง "มืออาชีพ" สำหรับงานเชิงธุรกิจ</li>
              <li>เสียงที่ได้จะเก็บใน MinIO ใช้ใน Video Pipeline ได้เลย</li>
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea:focus { border-color: rgba(0,255,212,.3) !important; }
      `}</style>
    </div>
  );
}
