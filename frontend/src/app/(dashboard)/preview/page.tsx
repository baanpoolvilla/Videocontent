"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fileUrl } from "@/lib/api";
import {
  Download, Play, RefreshCw, Loader2, Send,
  ToggleLeft, ToggleRight, Share2, Copy, Check,
  ChevronLeft, ChevronRight, Sparkles, Film,
} from "lucide-react";

interface Job {
  id: string; product_id: string; status: string;
  review_status: string; platform: string | null;
  created_at: string; updated_at: string;
}
interface RenderVersion {
  id: string; content_job_id: string; version_label: string | null;
  final_video_url: string | null; status: string; created_at: string;
  script_text?: string | null;
}
interface Product { id: string; name: string; media_urls: string[]; }

const VIDEO_STYLES: Record<string, { emoji: string; label: string; color: string; border: string }> = {
  playful: { emoji: "🎨", label: "Playful Overlay",    color: "rgba(255,107,183,.15)", border: "rgba(255,107,183,.4)" },
  luxury:  { emoji: "✨", label: "Luxury Cinematic",   color: "rgba(255,176,46,.15)",  border: "rgba(255,176,46,.4)"  },
  party:   { emoji: "🎉", label: "Party Vibes",         color: "rgba(0,255,212,.15)",   border: "rgba(0,255,212,.4)"   },
  minimal: { emoji: "⬜", label: "Minimal Clean",       color: "rgba(77,127,255,.15)",  border: "rgba(77,127,255,.4)"  },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PreviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [jobs, setJobs]         = useState<Job[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [renders, setRenders]   = useState<RenderVersion[]>([]);
  const [loading, setLoading]   = useState(true);

  // selected render
  const [selected, setSelected] = useState<RenderVersion | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // UI state
  const [captionOn, setCaptionOn] = useState(true);
  const [styleKey, setStyleKey]   = useState("playful");
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied]       = useState(false);
  const [remixing, setRemixing]   = useState(false);
  const [swapAudioUrl, setSwapAudioUrl] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      return p.get("audio_url") ?? "";
    }
    return "";
  });
  const [swapping, setSwapping]   = useState(false);
  const [swapDone, setSwapDone]   = useState(false);
  const [originalVol, setOriginalVol] = useState(0);
  const [voiceVol, setVoiceVol]       = useState(100);
  const [showVolPanel, setShowVolPanel] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    Promise.all([api.get("/jobs/?limit=50"), api.get("/products/")])
      .then(async ([j, p]) => {
        const jData: Job[] = j.data;
        setJobs(jData);
        const pm: Record<string, Product> = {};
        for (const x of p.data) pm[x.id] = x;
        setProducts(pm);

        // collect all renders from completed jobs
        const allRenders: RenderVersion[] = [];
        await Promise.all(
          jData.filter(job => job.status === "completed").map(async job => {
            try {
              const r = await api.get(`/jobs/${job.id}/renders`);
              for (const rv of r.data) {
                if (rv.final_video_url) allRenders.push({ ...rv, jobId: job.id });
              }
            } catch { /* skip */ }
          })
        );
        allRenders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRenders(allRenders);
        if (allRenders.length > 0) {
          setSelected(allRenders[0]);
          setSelectedJob(jData.find(j => j.id === allRenders[0].content_job_id) || null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const selectRender = (rv: RenderVersion) => {
    setSelected(rv);
    setSelectedJob(jobs.find(j => j.id === rv.content_job_id) || null);
  };

  const currentIndex = renders.findIndex(r => r.id === selected?.id);

  const prev = () => {
    if (currentIndex > 0) selectRender(renders[currentIndex - 1]);
  };
  const next = () => {
    if (currentIndex < renders.length - 1) selectRender(renders[currentIndex + 1]);
  };

  const copyStyle = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemix = async () => {
    if (!selectedJob) return;
    setRemixing(true);
    try {
      await api.post("/jobs/", { product_id: selectedJob.product_id, platform: selectedJob.platform || "tiktok" });
      router.push("/generate");
    } catch { /* ignore */ }
    finally { setRemixing(false); }
  };

  const handleSwapAudio = async () => {
    if (!selectedJob || !swapAudioUrl.trim()) return;
    setSwapping(true);
    setSwapDone(false);
    try {
      await api.post(`/jobs/${selectedJob.id}/remix-audio`, null, {
        params: {
          voiceover_url: swapAudioUrl.trim(),
          original_vol: (originalVol / 100).toFixed(3),
          voice_vol: (voiceVol / 100).toFixed(3),
        },
      });
      // poll until done
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const j = await api.get(`/jobs/${selectedJob.id}`);
        if (j.data.status === "completed" || j.data.status === "failed") break;
      }
      // reload renders
      const r = await api.get(`/jobs/${selectedJob.id}/renders`);
      const newRenders: RenderVersion[] = r.data.filter((rv: RenderVersion) => rv.final_video_url);
      if (newRenders.length > 0) {
        setRenders(prev => {
          const others = prev.filter(rv => rv.content_job_id !== selectedJob.id);
          return [...newRenders.map(rv => ({ ...rv, jobId: selectedJob.id })), ...others];
        });
        setSelected({ ...newRenders[0], jobId: selectedJob.id } as RenderVersion);
      }
      setSwapDone(true);
      setSwapAudioUrl("");
    } catch { /* ignore */ }
    finally { setSwapping(false); }
  };

  const handleChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatInput("");
    router.push(`/generate?remix=${encodeURIComponent(chatInput)}`);
  };

  const style = VIDEO_STYLES[styleKey];
  const product = selected && selectedJob ? products[selectedJob.product_id] : null;
  const videoUrl = selected?.final_video_url ? fileUrl(selected.final_video_url) : "";

  // mock transcript from version label
  const transcript = selected?.script_text || (product ? `${product.name} — วิดีโอที่สร้างจาก AI\nสไตล์ ${style?.label}\nเวอร์ชัน ${selected?.version_label || "A"}` : "");

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 14 }}>
        <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "var(--teal)" }} />
        <span style={{ fontSize: 13, color: "var(--faint)" }}>กำลังโหลดวิดีโอ…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (renders.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16, padding: 40 }}>
        <Film size={52} strokeWidth={1} style={{ opacity: .2 }} />
        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--dim)", margin: 0 }}>ยังไม่มีวิดีโอ</p>
        <p style={{ fontSize: 13, color: "var(--faint)", margin: 0 }}>สร้างวิดีโอใน Generate Studio ก่อน</p>
        <button onClick={() => router.push("/generate")} style={{
          padding: "11px 24px", borderRadius: 12, cursor: "pointer",
          background: "linear-gradient(90deg,var(--teal),var(--blue))",
          border: "none", color: "#06060A", fontSize: 13, fontWeight: 800,
        }}>
          ไป Generate Studio →
        </button>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", overflow: "hidden" }}>

      {/* ── Top bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 20px", borderBottom: "1px solid var(--gb)",
        background: "var(--surface)", flexShrink: 0,
      }}>
        <button onClick={() => router.push("/generate")} style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "var(--glass)", border: "1px solid var(--gb)",
          borderRadius: 8, padding: "6px 12px", cursor: "pointer",
          fontSize: 12, fontWeight: 700, color: "var(--dim)",
        }}>
          <ChevronLeft size={13} /> กลับ
        </button>

        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", flex: 1 }}>
          {product?.name || "Preview"} — {selected?.version_label || "v1"}
        </span>

        {/* Nav arrows */}
        <button onClick={prev} disabled={currentIndex <= 0} style={{
          padding: "6px 10px", borderRadius: 8, cursor: currentIndex <= 0 ? "not-allowed" : "pointer",
          background: "var(--glass)", border: "1px solid var(--gb)", color: currentIndex <= 0 ? "var(--faint)" : "var(--dim)",
        }}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 12, color: "var(--faint)", minWidth: 48, textAlign: "center" }}>
          {currentIndex + 1} / {renders.length}
        </span>
        <button onClick={next} disabled={currentIndex >= renders.length - 1} style={{
          padding: "6px 10px", borderRadius: 8, cursor: currentIndex >= renders.length - 1 ? "not-allowed" : "pointer",
          background: "var(--glass)", border: "1px solid var(--gb)", color: currentIndex >= renders.length - 1 ? "var(--faint)" : "var(--dim)",
        }}><ChevronRight size={14} /></button>

        {/* Remix */}
        <button onClick={handleRemix} disabled={remixing} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, cursor: "pointer",
          background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--dim)", fontSize: 12, fontWeight: 700,
        }}>
          {remixing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
          Remix
        </button>

        {/* Swap audio */}
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              value={swapAudioUrl}
              onChange={e => { setSwapAudioUrl(e.target.value); setSwapDone(false); }}
              placeholder="วาง Audio URL จาก Voice Generator..."
              style={{
                width: 220, padding: "6px 10px", borderRadius: 8, fontSize: 11,
                background: "#1a1a22", border: `1px solid ${swapDone ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
                color: "var(--text)", outline: "none",
              }}
            />
            {/* Volume toggle */}
            <button
              onClick={() => setShowVolPanel(v => !v)}
              title="ปรับระดับเสียง"
              style={{
                padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                background: showVolPanel ? "rgba(255,176,46,.15)" : "var(--glass)",
                border: `1px solid ${showVolPanel ? "rgba(255,176,46,.4)" : "var(--gb)"}`,
                color: showVolPanel ? "#ffb02e" : "var(--dim)",
              }}>🎚️</button>
            <button onClick={handleSwapAudio} disabled={swapping || !swapAudioUrl.trim()} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8,
              background: swapDone ? "rgba(0,255,212,.15)" : "rgba(77,127,255,.15)",
              border: `1px solid ${swapDone ? "rgba(0,255,212,.4)" : "rgba(77,127,255,.3)"}`,
              color: swapDone ? "var(--teal)" : "var(--blue)", fontSize: 11, fontWeight: 700,
              cursor: swapping || !swapAudioUrl.trim() ? "not-allowed" : "pointer",
              opacity: !swapAudioUrl.trim() ? 0.4 : 1,
            }}>
              {swapping ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : swapDone ? <Check size={11} /> : <Play size={11} />}
              {swapDone ? "เสร็จ!" : "ใส่เสียง"}
            </button>
          </div>

          {/* Volume panel */}
          {showVolPanel && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
              background: "#16161e", border: "1px solid var(--gb)", borderRadius: 12,
              padding: "14px 16px", width: 240, boxShadow: "0 8px 32px rgba(0,0,0,.6)",
            }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 800, color: "var(--dim)", letterSpacing: ".05em" }}>
                MIX เสียง
              </p>

              {/* Original vol */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>🎬 เสียงเดิมในคลิป</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: originalVol > 0 ? "#ffb02e" : "var(--faint)", minWidth: 34, textAlign: "right" }}>
                    {originalVol}%
                  </span>
                </div>
                <input
                  type="range" min={0} max={100} value={originalVol}
                  onChange={e => setOriginalVol(+e.target.value)}
                  style={{ width: "100%", accentColor: "#ffb02e", cursor: "pointer" }}
                />
              </div>

              {/* Voice vol */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>🎙️ เสียงพากย์</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--teal)", minWidth: 34, textAlign: "right" }}>
                    {voiceVol}%
                  </span>
                </div>
                <input
                  type="range" min={0} max={100} value={voiceVol}
                  onChange={e => setVoiceVol(+e.target.value)}
                  style={{ width: "100%", accentColor: "var(--teal)", cursor: "pointer" }}
                />
              </div>

              <p style={{ margin: "10px 0 0", fontSize: 10, color: "var(--faint)", lineHeight: 1.5 }}>
                {originalVol === 0
                  ? "โหมด: แทนเสียงทั้งหมด"
                  : `โหมด: ผสมเสียง (${originalVol}% + ${voiceVol}%)`}
              </p>
            </div>
          )}
        </div>

        {/* Copy style */}
        <button onClick={copyStyle} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, cursor: "pointer",
          background: copied ? "rgba(0,255,212,.1)" : "var(--glass)",
          border: `1px solid ${copied ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
          color: copied ? "var(--teal)" : "var(--dim)", fontSize: 12, fontWeight: 700,
        }}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied!" : "Copy style"}
        </button>

        {/* Download */}
        {videoUrl && (
          <a href={videoUrl} download style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9,
            background: "rgba(0,255,212,.12)", border: "1px solid rgba(0,255,212,.3)",
            color: "var(--teal)", textDecoration: "none", fontSize: 12, fontWeight: 700,
          }}>
            <Download size={13} /> Download
          </a>
        )}
      </div>

      {/* ── Body: left video + right panel ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ══ LEFT — video + thumbnail strip + chat ══ */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", background: "#0a0a0e", overflow: "hidden", position: "relative",
        }}>

          {/* Version tabs */}
          {renders.length > 1 && (
            <div style={{ display: "flex", gap: 6, padding: "12px 0 0", flexShrink: 0 }}>
              {renders.slice(0, 5).map((rv, i) => (
                <button key={rv.id} onClick={() => selectRender(rv)} style={{
                  padding: "4px 12px", borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: "pointer",
                  border: `1px solid ${selected?.id === rv.id ? "rgba(0,255,212,.5)" : "var(--gb)"}`,
                  background: selected?.id === rv.id ? "rgba(0,255,212,.15)" : "rgba(255,255,255,.04)",
                  color: selected?.id === rv.id ? "var(--teal)" : "var(--faint)",
                }}>
                  {rv.version_label || `Ver. ${String.fromCharCode(65 + i)}`}
                </button>
              ))}
            </div>
          )}

          {/* Main video */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px 24px", minHeight: 0,
          }}>
            {videoUrl ? (
              <div style={{
                position: "relative", borderRadius: 16, overflow: "hidden",
                boxShadow: "0 0 60px rgba(0,0,0,.6), 0 0 30px rgba(0,255,212,.08)",
                height: "100%", maxHeight: "calc(100vh - 200px)",
                aspectRatio: "9/16",
              }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {/* Caption overlay */}
                {captionOn && transcript && (
                  <div style={{
                    position: "absolute", bottom: 60, left: 0, right: 0,
                    padding: "0 16px", textAlign: "center", pointerEvents: "none",
                  }}>
                    <span style={{
                      display: "inline-block", background: "rgba(0,0,0,.72)", backdropFilter: "blur(4px)",
                      color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1.6,
                      padding: "6px 14px", borderRadius: 8, maxWidth: "90%",
                    }}>
                      {transcript.split("\n")[0]}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "var(--faint)" }}>
                <Play size={48} style={{ opacity: .2, marginBottom: 12 }} />
                <p style={{ margin: 0, fontSize: 13 }}>ไม่มีวิดีโอ</p>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {renders.length > 1 && (
            <div style={{
              display: "flex", gap: 8, padding: "8px 24px 12px",
              overflowX: "auto", flexShrink: 0, width: "100%",
            }}>
              {renders.map(rv => (
                <div key={rv.id} onClick={() => selectRender(rv)} style={{
                  flexShrink: 0, width: 54, height: 96, borderRadius: 8, overflow: "hidden", cursor: "pointer",
                  border: `2px solid ${selected?.id === rv.id ? "var(--teal)" : "transparent"}`,
                  transition: "border-color .15s",
                }}>
                  <video
                    src={rv.final_video_url ? fileUrl(rv.final_video_url) : ""}
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Chat input — "What would you like to edit..." */}
          <div style={{
            width: "100%", padding: "0 24px 16px", flexShrink: 0,
          }}>
            <form onSubmit={handleChat} style={{
              display: "flex", gap: 8, alignItems: "center",
              background: "rgba(255,255,255,.05)", border: "1px solid var(--gb)",
              borderRadius: 12, padding: "10px 14px",
            }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="What would you like to edit..."
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "var(--text)", fontSize: 13, fontFamily: "inherit",
                }}
              />
              <button type="submit" disabled={!chatInput.trim()} style={{
                width: 32, height: 32, borderRadius: 8, cursor: chatInput.trim() ? "pointer" : "not-allowed",
                background: chatInput.trim() ? "var(--teal)" : "var(--glass2)",
                border: "none", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .15s",
              }}>
                <Send size={14} color={chatInput.trim() ? "#06060A" : "var(--faint)"} />
              </button>
            </form>
          </div>
        </div>

        {/* ══ RIGHT PANEL — agent.opus.pro style ══ */}
        <div style={{
          width: 320, flexShrink: 0,
          background: "#111116", borderLeft: "1px solid var(--gb)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px" }}>

            {/* Style card */}
            <div style={{
              background: style?.color || "var(--glass)",
              border: `1px solid ${style?.border || "var(--gb)"}`,
              borderRadius: 14, padding: "14px 16px", marginBottom: 16,
            }}>
              <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                Style
              </p>
              <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)", marginBottom: 10 }}>
                {style?.emoji} {style?.label}
              </div>

              {/* Style picker mini */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(VIDEO_STYLES).map(([k, s]) => (
                  <button key={k} onClick={() => setStyleKey(k)} style={{
                    padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
                    border: `1px solid ${styleKey === k ? s.border : "var(--gb)"}`,
                    background: styleKey === k ? s.color : "transparent",
                    color: styleKey === k ? "var(--text)" : "var(--faint)",
                    transition: "all .12s",
                  }}>{s.emoji} {s.label.split(" ")[0]}</button>
                ))}
              </div>
            </div>

            {/* Badges */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {[
                { label: "Asset to video", color: "rgba(0,255,212,.1)", border: "rgba(0,255,212,.25)", text: "var(--teal)" },
                { label: "9:16",           color: "rgba(77,127,255,.1)", border: "rgba(77,127,255,.25)", text: "var(--blue)" },
                { label: "30s",            color: "var(--glass)",        border: "var(--gb)",            text: "var(--dim)" },
              ].map(b => (
                <span key={b.label} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: b.color, border: `1px solid ${b.border}`, color: b.text,
                }}>
                  {b.label}
                </span>
              ))}
            </div>

            {/* AI model badges */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {["Kling v1", "Seedance 1.5"].map(m => (
                <span key={m} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                  background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--dim)",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)", display: "inline-block" }} />
                  {m}
                </span>
              ))}
            </div>

            {/* Transcript */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ margin: "0 0 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
                Transcript
              </p>
              <div style={{
                background: "var(--glass)", border: "1px solid var(--gb)",
                borderRadius: 12, padding: "14px 16px",
                fontSize: 13, color: "var(--dim)", lineHeight: 1.8,
                minHeight: 100,
              }}>
                {transcript ? (
                  transcript.split("\n").filter(Boolean).map((line, i) => (
                    <p key={i} style={{ margin: "0 0 6px" }}>{line}</p>
                  ))
                ) : (
                  <span style={{ color: "var(--faint)", fontSize: 12 }}>ไม่มี script</span>
                )}
              </div>
            </div>

            {/* Caption toggle */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", background: "var(--glass)", border: "1px solid var(--gb)",
              borderRadius: 12, marginBottom: 20, cursor: "pointer",
            }} onClick={() => setCaptionOn(v => !v)}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dim)", display: "flex", alignItems: "center", gap: 7 }}>
                🔠 Caption
              </span>
              {captionOn
                ? <ToggleRight size={22} color="var(--teal)" />
                : <ToggleLeft size={22} color="var(--faint)" />}
            </div>

            {/* Job info */}
            {selectedJob && (
              <div style={{ marginBottom: 16 }}>
                {[
                  { label: "สถานะ", val: selectedJob.status },
                  { label: "สร้างเมื่อ", val: fmtDate(selectedJob.created_at) },
                  { label: "อัปเดต", val: fmtDate(selectedJob.updated_at) },
                ].map(({ label, val }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.04)", fontSize: 12 }}>
                    <span style={{ color: "var(--faint)" }}>{label}</span>
                    <span style={{ color: "var(--dim)", fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Bottom action buttons (sticky) ── */}
          <div style={{ padding: "14px 18px", borderTop: "1px solid var(--gb)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>

            {/* Download */}
            {videoUrl && (
              <a href={videoUrl} download style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "13px 20px", borderRadius: 12, textDecoration: "none",
                background: "#fff", color: "#06060A",
                fontSize: 14, fontWeight: 900,
                boxShadow: "0 2px 12px rgba(255,255,255,.15)",
              }}>
                <Download size={15} /> Download
              </a>
            )}

            {/* Publish on Social */}
            <button onClick={() => router.push("/publish")} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "12px 20px", borderRadius: 12, cursor: "pointer",
              background: "rgba(255,176,46,.12)", border: "1px solid rgba(255,176,46,.3)",
              color: "rgba(255,176,46,1)", fontSize: 13, fontWeight: 800,
            }}>
              <Share2 size={14} /> Publish on Social 🚀
            </button>

            {/* Approval */}
            {selectedJob?.review_status === "review_needed" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button onClick={async () => {
                  if (!selectedJob) return;
                  await api.patch(`/jobs/${selectedJob.id}/approve`);
                  setJobs(j => j.map(job => job.id === selectedJob.id ? { ...job, review_status: "approved" } : job));
                  setSelectedJob(prev => prev ? { ...prev, review_status: "approved" } : prev);
                }} style={{
                  padding: "10px", borderRadius: 10, cursor: "pointer",
                  background: "rgba(34,212,153,.12)", border: "1px solid rgba(34,212,153,.3)",
                  color: "var(--ok)", fontSize: 12, fontWeight: 800,
                }}>✓ อนุมัติ</button>
                <button onClick={async () => {
                  if (!selectedJob) return;
                  await api.patch(`/jobs/${selectedJob.id}/reject`);
                  setJobs(j => j.map(job => job.id === selectedJob.id ? { ...job, review_status: "rejected" } : job));
                  setSelectedJob(prev => prev ? { ...prev, review_status: "rejected" } : prev);
                }} style={{
                  padding: "10px", borderRadius: 10, cursor: "pointer",
                  background: "rgba(255,77,106,.1)", border: "1px solid rgba(255,77,106,.25)",
                  color: "var(--err)", fontSize: 12, fontWeight: 800,
                }}>✕ ปฏิเสธ</button>
              </div>
            )}

            {selectedJob?.review_status === "approved" && (
              <div style={{ textAlign: "center", padding: "8px", fontSize: 12, fontWeight: 700, color: "var(--ok)" }}>
                ✓ อนุมัติแล้ว
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--gb); border-radius: 4px; }
      `}</style>
    </div>
  );
}
