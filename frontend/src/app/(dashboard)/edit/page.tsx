"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  Upload, X, Loader2, Film, CheckCircle2, ChevronDown, ChevronUp,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────── */
interface ClipPlan {
  source_index: number;
  trim_start: number;
  trim_end: number;
  zoom: number;
  pan: string | null;
  transition: string;
  duration_sec: number;
}

interface EditResult {
  video_url: string;
  source_count: number;
  clips_used: number;
  plan: ClipPlan[];
  resolution: string;
  render_engine: string;
}


type Resolution     = "portrait" | "landscape" | "square";
type RenderEngine   = "ffmpeg" | "json2video";

const PRESETS = [
  { emoji: "🎉", label: "สนุก เฮฮา ปาร์ตี้",   value: "Fun, energetic and party vibe, upbeat fast cuts, vibrant colors, punchy transitions, friends having fun at pool villa" },
  { emoji: "✨", label: "หรู ซีเนมาติก",         value: "Luxury cinematic, slow elegant dissolves, golden hour tones, teal-orange grade, sophisticated pool villa atmosphere, 0.8x speed" },
  { emoji: "🏡", label: "ทัวร์รีวิวบ้าน",        value: "Property tour review style, showcase every room and feature clearly, smooth slide transitions, welcoming and informative" },
  { emoji: "💑", label: "โรแมนติก คู่รัก",       value: "Romantic couple getaway, soft warm tones, dreamy slow motion, gentle dissolves, intimate pool villa moments" },
  { emoji: "🌊", label: "ชิลล์ ผ่อนคลาย",       value: "Chill and relaxing vacation mood, turquoise pool, slow drifting shots, soft blue-green tones, peaceful atmosphere" },
  { emoji: "👨‍👩‍👧", label: "ครอบครัว เที่ยวด้วยกัน", value: "Family vacation, happy moments together, bright cheerful tones, natural light, warm and welcoming atmosphere" },
  { emoji: "📣", label: "โปรโมชัน ดึงดูด",       value: "Promotional marketing video, highlight best features, eye-catching transitions, bold and exciting, call-to-action energy" },
  { emoji: "🌅", label: "วิวธรรมชาติ เช้า-เย็น", value: "Nature and scenery focus, golden sunrise or sunset by the pool, cinematic landscape shots, serene and breathtaking" },
];

const RESOLUTION_OPTS: { value: Resolution; label: string; sub: string }[] = [
  { value: "portrait",  label: "แนวตั้ง  9:16", sub: "TikTok / Reel" },
  { value: "landscape", label: "แนวนอน 16:9",   sub: "YouTube / Facebook" },
  { value: "square",    label: "สี่เหลี่ยม 1:1", sub: "Instagram" },
];

/* ── Helpers ─────────────────────────────────────────────────────────*/
function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function zoomLabel(z: number) {
  if (z > 0) return `+${z} (ซูมเข้า)`;
  if (z < 0) return `${z} (ซูมออก)`;
  return "0 (ปกติ)";
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function EditPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  const [files,        setFiles]        = useState<File[]>([]);
  const [dragging,     setDragging]     = useState(false);
  const [prompt,       setPrompt]       = useState("");
  const [resolution,   setResolution]   = useState<Resolution>("portrait");
  const [renderEngine, setRenderEngine] = useState<RenderEngine>("ffmpeg");
  const [loading,      setLoading]      = useState(false);
  const [loadingMsg,   setLoadingMsg]   = useState("");
  const [result,       setResult]       = useState<EditResult | null>(null);
  const [error,        setError]        = useState("");
  const [showPlan,     setShowPlan]     = useState(false);

  /* ── Drag & drop ────────────────────────────────────────────────── */
  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f =>
      /\.(mp4|mov|avi|mkv|m4v)$/i.test(f.name)
    );
    setFiles(prev => {
      const merged = [...prev, ...arr];
      if (merged.length > 10) merged.splice(10);
      return merged;
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (i: number) =>
    setFiles(prev => prev.filter((_, idx) => idx !== i));

  /* ── Submit ─────────────────────────────────────────────────────── */
  async function handleGenerate() {
    if (!files.length) { setError("กรุณาอัปโหลดคลิปอย่างน้อย 1 ไฟล์"); return; }
    if (!prompt.trim()) { setError("กรุณาระบุ style prompt"); return; }

    setError("");
    setResult(null);
    setLoading(true);
    setShowPlan(false);

    try {
      // Stage each file individually to bypass Cloudflare 100MB limit
      const stageIds: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setLoadingMsg(`อัปโหลดคลิป ${i + 1}/${files.length}...`);
        const sf = new FormData();
        sf.append("file", files[i]);
        const sr = await api.post("/video-edit/stage", sf, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        stageIds.push((sr.data as { stage_id: string }).stage_id);
      }

      // Trigger processing with staged IDs
      setLoadingMsg("AI วิเคราะห์เฟรม + render...");
      const fd = new FormData();
      fd.append("style_prompt", prompt.trim());
      fd.append("resolution", resolution);
      fd.append("render_engine", renderEngine);
      stageIds.forEach(id => fd.append("stage_ids", id));

      const res = await api.post("/video-edit", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data as EditResult);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "เกิดข้อผิดพลาด กรุณาลองใหม่";
      setError(msg);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  /* ── UI ─────────────────────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 840, margin: "0 auto", padding: "28px 20px 60px" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--text)" }}>
          <Film size={20} style={{ marginRight: 8, verticalAlign: "middle" }} />
          ตัดต่อวิดีโอ AI
        </h1>
        <p style={{ margin: "6px 0 0", color: "var(--dim)", fontSize: 13.5 }}>
          อัปโหลดคลิปดิบ 1–10 ไฟล์ · AI วิเคราะห์เฟรมและตัดต่อให้ · ได้วิดีโอพร้อมใช้งาน
        </p>
      </div>

      {/* Upload zone */}
      <div
        ref={dropRef}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => files.length < 10 && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "var(--teal)" : "var(--gb)"}`,
          borderRadius: 14,
          padding: files.length ? "16px" : "40px 20px",
          textAlign: "center",
          cursor: files.length < 10 ? "pointer" : "default",
          background: dragging ? "rgba(0,255,212,.05)" : "var(--glass)",
          transition: "all .2s",
          marginBottom: 18,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".mp4,.mov,.avi,.mkv,.m4v"
          style={{ display: "none" }}
          onChange={e => e.target.files && addFiles(e.target.files)}
        />

        {files.length === 0 ? (
          <>
            <Upload size={36} style={{ color: "var(--teal)", marginBottom: 10 }} />
            <p style={{ margin: 0, fontWeight: 700, color: "var(--text)", fontSize: 15 }}>
              ลากวิดีโอมาวางที่นี่ หรือคลิกเพื่อเลือก
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--dim)" }}>
              MP4 · MOV · AVI · MKV · สูงสุด 10 ไฟล์
            </p>
          </>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--glass2)", borderRadius: 8,
                padding: "5px 10px", fontSize: 12.5, color: "var(--text)",
                border: "1px solid var(--gb)",
              }}>
                <Film size={12} style={{ color: "var(--teal)", flexShrink: 0 }} />
                <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                </span>
                <span style={{ color: "var(--dim)", fontSize: 11 }}>
                  {(f.size / 1_048_576).toFixed(1)}MB
                </span>
                <button
                  onClick={e => { e.stopPropagation(); removeFile(i); }}
                  style={{ border: "none", background: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
                >
                  <X size={13} style={{ color: "var(--dim)" }} />
                </button>
              </div>
            ))}
            {files.length < 10 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "rgba(0,255,212,.08)", borderRadius: 8,
                padding: "5px 12px", fontSize: 12.5, color: "var(--teal)",
                border: "1px dashed var(--teal)", cursor: "pointer",
              }}>
                + เพิ่มคลิป
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preset buttons */}
      <div style={{ marginBottom: 14 }}>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          สไตล์ด่วน
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {PRESETS.map(p => {
            const active = prompt === p.value;
            return (
              <button
                key={p.label}
                onClick={() => setPrompt(p.value)}
                style={{
                  padding: "10px 12px", borderRadius: 10, fontSize: 13, cursor: "pointer",
                  border: `1px solid ${active ? "var(--teal)" : "var(--gb)"}`,
                  background: active ? "rgba(0,255,212,.12)" : "var(--glass2)",
                  color: active ? "var(--teal)" : "var(--text)",
                  fontWeight: active ? 700 : 500,
                  textAlign: "left", transition: "all .15s",
                  display: "flex", flexDirection: "column", gap: 3,
                }}
              >
                <span style={{ fontSize: 20 }}>{p.emoji}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.3 }}>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Style prompt */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          Style Prompt
        </p>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--dim)" }}>
          พิมได้ทั้ง <b style={{ color: "var(--teal)" }}>ภาษาไทย</b> หรือ <b style={{ color: "var(--teal)" }}>English</b> — Gemini เข้าใจทั้งสองภาษา
        </p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={
            "ตัวอย่างไทย: ตัดต่อแบบรีวิวพูลวิลล่า บรรยากาศหรูหรา เน้นสระน้ำและวิวทะเล\n" +
            "ตัวอย่าง English: luxury pool villa tour, golden hour, slow elegant cuts, cinematic"
          }
          rows={4}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "var(--glass)", border: "1px solid var(--gb)",
            borderRadius: 10, padding: "12px 14px",
            color: "var(--text)", fontSize: 14, resize: "vertical",
            outline: "none", fontFamily: "inherit",
          }}
        />
      </div>

      {/* Resolution */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          ความละเอียด / อัตราส่วน
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          {RESOLUTION_OPTS.map(r => (
            <button
              key={r.value}
              onClick={() => setResolution(r.value)}
              style={{
                flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${resolution === r.value ? "var(--teal)" : "var(--gb)"}`,
                background: resolution === r.value ? "rgba(0,255,212,.1)" : "var(--glass2)",
                color: resolution === r.value ? "var(--teal)" : "var(--dim)",
                textAlign: "center", transition: "all .15s",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.label}</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{r.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Render Engine */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          Render Engine
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setRenderEngine("ffmpeg")}
            style={{
              flex: 1, padding: "12px 10px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${renderEngine === "ffmpeg" ? "var(--teal)" : "var(--gb)"}`,
              background: renderEngine === "ffmpeg" ? "rgba(0,255,212,.1)" : "var(--glass2)",
              color: renderEngine === "ffmpeg" ? "var(--teal)" : "var(--dim)",
              textAlign: "left", transition: "all .15s",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>🎬 FFmpeg</div>
            <div style={{ fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>
              Zoom · Color Grade · Crossfade
              <br />เร็ว · ไม่ต้องใช้ API · คุณภาพสูง
            </div>
          </button>
          <button
            onClick={() => setRenderEngine("json2video")}
            style={{
              flex: 1, padding: "12px 10px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${renderEngine === "json2video" ? "#888" : "var(--gb)"}`,
              background: renderEngine === "json2video" ? "rgba(255,255,255,.05)" : "var(--glass2)",
              color: renderEngine === "json2video" ? "var(--text)" : "var(--dim)",
              textAlign: "left", transition: "all .15s",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>☁️ JSON2Video</div>
            <div style={{ fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>
              Cloud render (เดิม)
              <br />ช้ากว่า · ใช้ external API
            </div>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(255,80,80,.1)", border: "1px solid rgba(255,80,80,.3)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 18,
          color: "#ff6b6b", fontSize: 13.5,
        }}>
          {error}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading || !files.length || !prompt.trim()}
        style={{
          width: "100%", padding: "14px", borderRadius: 12, fontSize: 15,
          fontWeight: 800, cursor: loading ? "wait" : "pointer",
          border: "none",
          background: loading || !files.length || !prompt.trim()
            ? "var(--glass2)"
            : "linear-gradient(135deg, #00ffd4, #0088ff)",
          color: loading || !files.length || !prompt.trim() ? "var(--dim)" : "#000",
          transition: "all .2s",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        {loading ? (
          <>
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
            {loadingMsg || "AI กำลังตัดต่อวิดีโอ..."}
          </>
        ) : (
          <>
            <Film size={18} />
            ตัดต่อวิดีโออัตโนมัติ
          </>
        )}
      </button>

      {loading && (
        <p style={{ textAlign: "center", color: "var(--dim)", fontSize: 12.5, marginTop: 10 }}>
          {loadingMsg.startsWith("อัปโหลด")
            ? "อัปโหลดทีละไฟล์เพื่อข้ามลิมิต 100MB · รอแป๊บนึง..."
            : renderEngine === "ffmpeg"
              ? "Gemini วิเคราะห์เฟรม → FFmpeg render · อาจใช้เวลา 2–5 นาที"
              : "Gemini วิเคราะห์เฟรม → JSON2Video cloud · อาจใช้เวลา 3–6 นาที"}
        </p>
      )}

      {/* ── Result ─────────────────────────────────────────────────── */}
      {result && (
        <div style={{ marginTop: 32 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 18,
            background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.25)",
            borderRadius: 12, padding: "12px 16px",
          }}>
            <CheckCircle2 size={18} style={{ color: "var(--teal)", flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: "var(--text)" }}>
              ตัดต่อสำเร็จ — {result.clips_used} คลิปจาก {result.source_count} ต้นฉบับ
              {" "}
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>
                [{result.render_engine === "ffmpeg" ? "🎬 FFmpeg" : "☁️ JSON2Video"}]
              </span>
            </span>
          </div>

          {/* Video player */}
          <div style={{ borderRadius: 14, overflow: "hidden", background: "#000", marginBottom: 20 }}>
            <video
              src={result.video_url}
              controls
              style={{ width: "100%", display: "block", maxHeight: 520 }}
            />
          </div>

          {/* Download */}
          <a
            href={result.video_url}
            download="edited_video.mp4"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block", padding: "10px 22px", borderRadius: 10,
              background: "var(--teal)", color: "#000", fontWeight: 700, fontSize: 13.5,
              textDecoration: "none", marginBottom: 24,
            }}
          >
            ดาวน์โหลดวิดีโอ
          </a>

          {/* Plan breakdown toggle */}
          <button
            onClick={() => setShowPlan(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6, marginLeft: 12,
              border: "1px solid var(--gb)", background: "var(--glass2)",
              borderRadius: 8, padding: "8px 14px", cursor: "pointer",
              color: "var(--dim)", fontSize: 13, fontWeight: 600,
            }}
          >
            {showPlan ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            รายละเอียดการตัดต่อ ({result.plan.length} ช็อต)
          </button>

          {showPlan && (
            <div style={{ marginTop: 14, overflowX: "auto" }}>
              <table style={{
                width: "100%", borderCollapse: "collapse",
                fontSize: 12.5, color: "var(--text)",
              }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--gb)", color: "var(--dim)" }}>
                    {["#", "คลิปต้นฉบับ", "ตัดเริ่ม", "ตัดจบ", "ความยาว", "Zoom", "Pan", "Transition"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.plan.map((c, i) => (
                    <tr key={i} style={{
                      borderBottom: "1px solid var(--gb)",
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.02)",
                    }}>
                      <td style={{ padding: "8px 12px", color: "var(--teal)", fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: "8px 12px" }}>คลิป {c.source_index + 1}</td>
                      <td style={{ padding: "8px 12px" }}>{c.trim_start}s</td>
                      <td style={{ padding: "8px 12px" }}>{c.trim_end}s</td>
                      <td style={{ padding: "8px 12px" }}>{fmtSec(c.duration_sec)}</td>
                      <td style={{ padding: "8px 12px" }}>{zoomLabel(c.zoom)}</td>
                      <td style={{ padding: "8px 12px" }}>{c.pan || "—"}</td>
                      <td style={{ padding: "8px 12px", textTransform: "capitalize" }}>{c.transition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        textarea:focus { border-color: var(--teal) !important; box-shadow: 0 0 0 2px rgba(0,255,212,.15); }
      `}</style>
    </div>
  );
}
