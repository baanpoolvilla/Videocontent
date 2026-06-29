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
  thumbnail_url: string | null;
  source_count: number;
  clips_used: number;
  plan: ClipPlan[];
  resolution: string;
  render_engine: string;
  ai_model: string;
}


type Resolution     = "portrait" | "landscape" | "square";
type RenderEngine   = "ffmpeg" | "json2video";

const PRESETS = [
  { emoji: "🎉", label: "สนุก เฮฮา ปาร์ตี้",   value: "Fun energetic party vibe — select only peak moments where people are genuinely laughing, celebrating, toasting, dancing, splashing or cheering. Each clip 5-10 seconds. Alternate zoom-in and zoom-out shots. White flash transitions. Vibrant warm punchy colors. Order from most exciting to least — last clip must be a strong moment. Reject setup, walking, or boring shots." },
  { emoji: "✨", label: "หรู ซีเนมาติก",         value: "Luxury cinematic style — select wide establishing shots, beautiful details, elegant atmosphere, and striking visuals. Each clip 6-12 seconds. Slow gentle zoom-in on beauty shots, slow zoom-out on wide reveals. Smooth dissolve or fade transitions. Teal-orange color grade, warm tones. Speed 0.8x slow-motion feel. Order from most visually striking to supporting shots." },
  { emoji: "🏡", label: "ทัวร์รีวิว",            value: "Review tour style — showcase every key feature and space clearly. Select well-composed shots of each area. Each clip 8-15 seconds. Gentle zoom-in toward key features. Slide transitions. Natural warm lighting preferred. Speed 1.0x. Cover all areas systematically." },
  { emoji: "💑", label: "โรแมนติก",              value: "Romantic intimate mood — select soft natural light moments, warm atmosphere, gentle interactions, beautiful surroundings. Each clip 6-12 seconds. Slow zoom-in toward subjects. Soft dissolve transitions. Warm dreamy tones, slight desaturation. Speed 0.85x. Build from atmosphere to intimate moments." },
  { emoji: "🌊", label: "ชิลล์ ผ่อนคลาย",       value: "Chill relaxing vacation mood — select calm peaceful scenes, beautiful surroundings, quiet moments. Each clip 7-12 seconds. Very slow zoom-out to reveal the environment. Soft fade transitions. Fresh cool tones. Speed 0.9x. Begin with close details and slowly reveal the full setting." },
  { emoji: "👨‍👩‍👧", label: "ครอบครัว",              value: "Family happy moments — select genuine interactions, kids playing, group activities, smiling faces, shared experiences. Each clip 6-10 seconds. Mix zoom-in on faces and zoom-out for group shots. Bright cheerful colors. Speed 1.0x. Order from group activities to individual happy moments." },
  { emoji: "📣", label: "โปรโมชัน ดึงดูด",       value: "Promotional marketing video — select the most impressive visuals, premium features, happy people, stunning moments. Each clip 5-8 seconds. Aggressive zoom-in on hero shots, zoom-out on establishing scenes. Dynamic flash transitions. Bold vibrant high-contrast colors. Speed 1.05x. Open and close with the strongest shots." },
  { emoji: "🌅", label: "วิวธรรมชาติ",           value: "Nature and scenery — select golden hour, sunrise, sunset, sky reflections, dramatic landscapes, beautiful light. Each clip 8-15 seconds. Slow zoom-out to reveal the full scenic view. Gentle dissolve transitions. Warm golden tones. Speed 0.85x. Build toward the most dramatic moment." },
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
  const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB per chunk

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

  async function uploadFile(file: File, idx: number, total: number): Promise<string> {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (totalChunks === 1) {
      // Small file — direct stage
      setLoadingMsg(`อัปโหลดคลิป ${idx + 1}/${total}...`);
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/video-edit/stage", fd, { headers: { "Content-Type": "multipart/form-data" } });
      return (r.data as { stage_id: string }).stage_id;
    }

    // Large file — chunked upload
    for (let i = 0; i < totalChunks; i++) {
      setLoadingMsg(`อัปโหลดคลิป ${idx + 1}/${total} (${i + 1}/${totalChunks} ชิ้น)...`);
      const start = i * CHUNK_SIZE;
      const blob  = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
      const fd    = new FormData();
      fd.append("upload_id",    uploadId);
      fd.append("chunk_index",  String(i));
      fd.append("total_chunks", String(totalChunks));
      fd.append("filename",     file.name);
      fd.append("chunk",        new Blob([blob], { type: file.type }), file.name);
      await api.post("/video-edit/chunk", fd, { headers: { "Content-Type": "multipart/form-data" } });
    }

    // Assemble
    setLoadingMsg(`รวมไฟล์คลิป ${idx + 1}/${total}...`);
    const afd = new FormData();
    afd.append("upload_id",    uploadId);
    afd.append("total_chunks", String(totalChunks));
    afd.append("filename",     file.name);
    const ar = await api.post("/video-edit/assemble", afd, { headers: { "Content-Type": "multipart/form-data" } });
    return (ar.data as { stage_id: string }).stage_id;
  }

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
      // Upload each file (chunked for large files — no size limit)
      const stageIds: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const stageId = await uploadFile(files[i], i, files.length);
        stageIds.push(stageId);
      }

      // Start async render job — returns immediately with job_id
      setLoadingMsg("กำลังส่งงานให้ AI...");
      const fd = new FormData();
      fd.append("style_prompt", prompt.trim());
      fd.append("resolution", resolution);
      fd.append("render_engine", renderEngine);
      stageIds.forEach(id => fd.append("stage_ids", id));

      const startRes = await api.post("/video-edit/start", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { job_id } = startRes.data as { job_id: string };

      // Poll status every 3 seconds
      const t0 = Date.now();
      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const elapsed = Math.floor((Date.now() - t0) / 1000);
            const m = Math.floor(elapsed / 60);
            const s = elapsed % 60;
            const timeStr = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
            setLoadingMsg(`กำลัง render... (${timeStr})`);

            const statusRes = await api.get(`/video-edit/job/${job_id}`);
            const job = statusRes.data as {
              status: string; video_url?: string; thumbnail_url?: string | null; error?: string;
              clips_used?: number; plan?: ClipPlan[]; resolution?: string; render_engine?: string; ai_model?: string;
            };

            if (job.status === "done") {
              clearInterval(interval);
              setResult({
                video_url:     job.video_url!,
                thumbnail_url: job.thumbnail_url ?? null,
                source_count:  files.length,
                clips_used:    job.clips_used!,
                plan:          job.plan!,
                resolution:    job.resolution!,
                render_engine: job.render_engine!,
                ai_model:      job.ai_model ?? "gemini-2.5-flash",
              });
              resolve();
            } else if (job.status === "failed") {
              clearInterval(interval);
              reject(new Error(job.error || "Render ล้มเหลว"));
            }
          } catch {
            // polling error — keep retrying
          }
        }, 3000);
      });
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
                [{result.render_engine === "ffmpeg" ? "🎬 FFmpeg" : "☁️ JSON2Video"}
                {" · "}
                {result.ai_model === "gpt-4o-mini" ? "🤖 GPT-4o mini" : "✨ Gemini 2.5 Flash"}]
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

          {/* Download + Thumbnail */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <a
              href={result.video_url}
              download="edited_video.mp4"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block", padding: "10px 22px", borderRadius: 10,
                background: "var(--teal)", color: "#000", fontWeight: 700, fontSize: 13.5,
                textDecoration: "none",
              }}
            >
              ดาวน์โหลดวิดีโอ
            </a>
            {result.thumbnail_url && (
              <a
                href={result.thumbnail_url}
                download="thumbnail.jpg"
                target="_blank"
                rel="noopener noreferrer"
                title="คลิกดาวน์โหลด Thumbnail"
                style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}
              >
                <img
                  src={result.thumbnail_url}
                  alt="thumbnail"
                  style={{ height: 56, borderRadius: 8, border: "1px solid var(--gb)", objectFit: "cover" }}
                />
                <span style={{ fontSize: 12, color: "var(--dim)" }}>📷 Thumbnail</span>
              </a>
            )}
          </div>

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
