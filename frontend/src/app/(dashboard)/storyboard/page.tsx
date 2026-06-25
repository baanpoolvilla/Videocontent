"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Loader2, Sparkles, ChevronUp, ChevronDown, CheckCircle2, Wand2 } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }
type AIModel = "kenburs" | "hailuo2pro" | "kling3s";

interface ClipSlot {
  imageIndex: number;
  prompt: string;
  duration: number;
}

interface ModelDef {
  id: AIModel;
  label: string;
  price: string;
  color: string;
  durations: number[];
  badge: string;
  outputLine1: string;
  outputLine2: string;
  stars: number;
}

const MODELS: ModelDef[] = [
  {
    id: "kenburs",
    label: "Ken Burns",
    price: "ฟรี",
    color: "#22D499",
    durations: [5, 10, 15, 20, 30],
    badge: "FREE",
    outputLine1: "รูปซูม / เลื่อนอัตโนมัติ",
    outputLine2: "FFmpeg — ไม่ใช่ AI จริง ไม่มีการเคลื่อนไหว",
    stars: 1,
  },
  {
    id: "hailuo2pro",
    label: "Hailuo 2.3 Pro",
    price: "$0.49 / คลิป",
    color: "#A78BFA",
    durations: [5, 10],
    badge: "AI VIDEO",
    outputLine1: "AI สร้างการเคลื่อนไหวจริงจากรูป",
    outputLine2: "water ripple · camera dolly · bokeh · atmosphere",
    stars: 4,
  },
  {
    id: "kling3s",
    label: "Kling v3 Standard",
    price: "$1.89 / คลิป",
    color: "#00FFD4",
    durations: [5, 10],
    badge: "PREMIUM",
    outputLine1: "AI คุณภาพสูงสุด — ระดับภาพยนตร์",
    outputLine2: "คมชัดที่สุด เหมือนถ่ายจริง รองรับ motion ซับซ้อน",
    stars: 5,
  },
];

function imgProxy(url: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return url.startsWith("/") ? `${base}/api/v1/files/${url.slice(1)}` : url;
}

function Stars({ n, color }: { n: number; color: string }) {
  return (
    <span style={{ fontSize: 10, letterSpacing: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ color: i < n ? color : "rgba(255,255,255,.15)" }}>★</span>
      ))}
    </span>
  );
}

export default function StoryboardPage() {
  const router = useRouter();
  const [products, setProducts]       = useState<Product[]>([]);
  const [product, setProduct]         = useState<Product | null>(null);
  const [slots, setSlots]             = useState<ClipSlot[]>([]);
  const [aiModel, setAiModel]         = useState<AIModel>("hailuo2pro");
  const [phase, setPhase]             = useState<"setup" | "rendering" | "done" | "error">("setup");
  const [renderStep, setRenderStep]   = useState("");
  const [errMsg, setErrMsg]           = useState("");
  const [videoUrl, setVideoUrl]       = useState("");
  const [generating, setGenerating]   = useState<number | null>(null);
  const [sessionJobId, setSessionJobId] = useState<string | null>(null);

  const modelDef = MODELS.find(m => m.id === aiModel)!;

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {});
  }, []);

  const selectProduct = (p: Product) => {
    setProduct(p);
    setSessionJobId(null);
    setSlots(p.media_urls.slice(0, 6).map((_, i) => ({ imageIndex: i, prompt: "", duration: 5 })));
  };

  const getOrCreateJob = async (productId: string): Promise<string> => {
    if (sessionJobId) return sessionJobId;
    const res = await api.post("/jobs/", { product_id: productId, platform: "tiktok" });
    const id: string = res.data.id;
    setSessionJobId(id);
    return id;
  };

  const updateSlot = (i: number, patch: Partial<ClipSlot>) =>
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const moveSlot = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slots.length) return;
    setSlots(prev => { const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  };

  // Build public image URL for a given slot
  const slotImgUrl = (slot: ClipSlot): string => {
    if (!product) return "";
    const imgPath = product.media_urls[slot.imageIndex] || "";
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return imgPath.startsWith("/") ? `${base}/api/v1/files/${imgPath.slice(1)}` : imgPath;
  };

  const suggestPrompt = async (i: number) => {
    if (!product) return;
    setGenerating(i);
    try {
      const jobId = await getOrCreateJob(product.id);
      const r = await api.get(`/jobs/${jobId}/suggest-video-prompt`, {
        params: { style: "luxury", concept: slots[i].prompt, image_url: slotImgUrl(slots[i]) },
      });
      updateSlot(i, { prompt: r.data.video_prompt || "" });
    } catch { /* keep */ }
    setGenerating(null);
  };

  // Auto-enhance: for slots that have empty / Thai / too-short prompts, call Gemini before render
  const autoEnhanceAll = async (jobId: string, currentSlots: ClipSlot[]): Promise<ClipSlot[]> => {
    const enhanced = [...currentSlots];
    for (let i = 0; i < enhanced.length; i++) {
      const slot = enhanced[i];
      const hasThai = /[฀-๿]/.test(slot.prompt);
      const tooShort = slot.prompt.trim().split(/\s+/).filter(Boolean).length < 8;
      if (!slot.prompt.trim() || hasThai || tooShort) {
        try {
          const r = await api.get(`/jobs/${jobId}/suggest-video-prompt`, {
            params: { style: "luxury", concept: slot.prompt, image_url: slotImgUrl(slot) },
          });
          if (r.data.video_prompt) {
            enhanced[i] = { ...slot, prompt: r.data.video_prompt };
          }
        } catch { /* keep original */ }
      }
    }
    return enhanced;
  };

  const totalCost = aiModel === "kenburs" ? 0 : slots.length * (aiModel === "hailuo2pro" ? 0.49 : 1.89);
  const totalDuration = slots.reduce((s, c) => s + c.duration, 0);

  const runRender = async () => {
    if (!product || slots.length === 0) return;
    setPhase("rendering");
    try {
      const jobId = await getOrCreateJob(product.id);

      // 1. Auto-enhance all prompts (fills empty / translates Thai → proper Hailuo prompt)
      if (aiModel !== "kenburs") {
        setRenderStep(`Gemini อ่านรูปและเขียน prompt ให้ทุกคลิป...`);
        const enhanced = await autoEnhanceAll(jobId, slots);
        setSlots(enhanced);

        // 2. Generate script for voiceover
        setRenderStep("Gemini เขียน script เสียงพากย์...");
        await api.post(`/jobs/${jobId}/generate-script`, null, {
          params: { tone_of_voice: "luxury cinematic", duration_sec: totalDuration, concept: "" },
        });

        // 3. Generate voiceover
        setRenderStep("ElevenLabs สร้างเสียงพากย์...");
        let voiceoverUrl = "";
        try {
          const voRes = await api.post(`/jobs/${jobId}/voiceover`, null, {
            params: { voice_style: "เป็นกันเอง (หญิง)" },
          });
          voiceoverUrl = (voRes.data as { voiceover_url?: string }).voiceover_url || "";
        } catch { /* optional */ }

        // 4. Story render using the enhanced prompts (use `enhanced`, not stale `slots` state)
        setRenderStep(`${aiModel === "hailuo2pro" ? "Hailuo" : "Kling"} กำลัง render ${slots.length} คลิป... รอ ${slots.length * 1}–${slots.length * 3} นาที`);
        await api.post(`/jobs/${jobId}/story-render`, {
          clips: enhanced.map(s => ({
            image_index: s.imageIndex,
            prompt: s.prompt,
            duration_sec: Math.min(s.duration, modelDef.durations[modelDef.durations.length - 1]),
          })),
          ai_model: aiModel,
          aspect_ratio: "9:16",
          voiceover_url: voiceoverUrl,
        });
      } else {
        // Ken Burns path — no Gemini, no voiceover needed
        setRenderStep("สร้างวิดีโอ Ken Burns...");
        await api.post(`/jobs/${jobId}/story-render`, {
          clips: slots.map(s => ({ image_index: s.imageIndex, prompt: "", duration_sec: s.duration })),
          ai_model: "kenburs",
          aspect_ratio: "9:16",
          voiceover_url: "",
        });
      }

      // 5. Poll
      setRenderStep("รอ render เสร็จ...");
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const j = await api.get(`/jobs/${jobId}`);
        if (j.data.status === "failed") throw new Error(j.data.error_message || "Render failed");
        if (j.data.status === "completed") {
          const renders = await api.get(`/jobs/${jobId}/renders`);
          const done = (renders.data as { status: string; final_video_url?: string }[])
            .find(r => r.status === "completed" && r.final_video_url);
          if (done?.final_video_url) setVideoUrl(imgProxy(done.final_video_url));
          break;
        }
      }
      setPhase("done");
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setPhase("error");
    }
  };

  /* ─── Loading screens ─── */
  if (phase === "rendering") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, background: "var(--bg)", padding: 32 }}>
      <Loader2 size={44} style={{ animation: "spin 1s linear infinite", color: "var(--teal)" }} />
      <div style={{ fontSize: 20, fontWeight: 900 }}>กำลังสร้างวิดีโอ...</div>
      <div style={{ padding: "12px 20px", background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 12, fontSize: 13, color: "var(--dim)", maxWidth: 380, textAlign: "center", lineHeight: 1.7 }}>
        {renderStep}
      </div>
      <div style={{ fontSize: 11, color: "var(--faint)" }}>อย่าปิดหน้าต่างนี้ ระหว่างรอ</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (phase === "done") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "var(--bg)", padding: 40 }}>
      <CheckCircle2 size={48} color="var(--ok)" />
      <div style={{ fontSize: 22, fontWeight: 900 }}>สร้างสำเร็จ!</div>
      {videoUrl && <video src={videoUrl} controls autoPlay loop playsInline style={{ width: "100%", maxWidth: 320, borderRadius: 16, border: "1px solid var(--gb)" }} />}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => router.push("/preview")} style={{ padding: "12px 20px", borderRadius: 12, background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none", color: "#06060A", fontWeight: 800, cursor: "pointer" }}>ดูใน Preview →</button>
        <button onClick={() => { setPhase("setup"); setVideoUrl(""); setSessionJobId(null); }} style={{ padding: "12px 16px", borderRadius: 12, background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--faint)", cursor: "pointer" }}>สร้างใหม่</button>
      </div>
    </div>
  );

  if (phase === "error") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 36 }}>⚠️</div>
      <div style={{ color: "var(--err)", fontSize: 14, maxWidth: 340, textAlign: "center" }}>{errMsg}</div>
      <button onClick={() => setPhase("setup")} style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(255,77,106,.1)", border: "1px solid rgba(255,77,106,.2)", color: "var(--err)", cursor: "pointer" }}>ลองใหม่</button>
    </div>
  );

  /* ─── Main setup UI ─── */
  return (
    <div className="page-enter" style={{ padding: "28px 40px", maxWidth: 940, margin: "0 auto" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>Story Mode</p>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800 }}>Storyboard Editor</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>แต่ละรูปมี prompt ของตัวเอง · AI Gemini อ่านรูปเขียน prompt ให้อัตโนมัติก่อน render</p>

      {/* ── Model selector (first, before product) ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
          เลือก AI Model ก่อน
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {MODELS.map(m => {
            const active = aiModel === m.id;
            return (
              <button key={m.id} onClick={() => {
                setAiModel(m.id);
                setSlots(prev => prev.map(s => ({
                  ...s,
                  duration: m.durations.includes(s.duration) ? s.duration : m.durations[0],
                })));
              }} style={{
                padding: "14px 12px", borderRadius: 14, cursor: "pointer", textAlign: "left",
                border: `2px solid ${active ? m.color : "var(--gb)"}`,
                background: active ? `${m.color}12` : "var(--glass)",
                transition: "all .15s", position: "relative",
              }}>
                {/* Badge */}
                <div style={{
                  position: "absolute", top: 10, right: 10,
                  fontSize: 8, fontWeight: 900, letterSpacing: ".06em",
                  padding: "2px 6px", borderRadius: 4,
                  background: active ? m.color : "rgba(255,255,255,.08)",
                  color: active ? "#06060A" : "var(--faint)",
                }}>{m.badge}</div>

                <div style={{ fontSize: 13, fontWeight: 900, color: active ? m.color : "var(--text)", marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: active ? m.color + "cc" : "var(--faint)", marginBottom: 8 }}>{m.price}</div>

                <div style={{ fontSize: 11, color: active ? "var(--text)" : "var(--dim)", fontWeight: 700, marginBottom: 3 }}>{m.outputLine1}</div>
                <div style={{ fontSize: 10, color: "var(--faint)", lineHeight: 1.5, marginBottom: 8 }}>{m.outputLine2}</div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Stars n={m.stars} color={m.color} />
                  <div style={{ fontSize: 10, color: "var(--faint)" }}>
                    {m.durations.join(" / ")} วิ
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Model info strip */}
        <div style={{ marginTop: 10, padding: "10px 14px", background: `${modelDef.color}0e`, border: `1px solid ${modelDef.color}30`, borderRadius: 10, fontSize: 12 }}>
          <span style={{ fontWeight: 800, color: modelDef.color }}>{modelDef.label}</span>
          <span style={{ color: "var(--dim)", marginLeft: 8 }}>
            ความยาวที่รองรับ: <b>{modelDef.durations.map(d => `${d}s`).join(", ")}</b>
            {modelDef.id === "kenburs" ? " (ใส่เท่าไหร่ก็ได้ FFmpeg ไม่มี limit)" : " (fal.ai API limit)"}
          </span>
          {modelDef.id !== "kenburs" && (
            <span style={{ color: "var(--faint)", marginLeft: 8 }}>· Gemini อ่านรูปเขียน prompt อัตโนมัติก่อน render</span>
          )}
        </div>
      </div>

      {/* ── Product selector ── */}
      {!product ? (
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dim)", marginBottom: 12 }}>เลือก Asset:</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 10 }}>
            {products.map(p => (
              <button key={p.id} onClick={() => selectProduct(p)} style={{
                padding: "14px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                background: "var(--glass)", border: "1px solid var(--gb)", transition: "border-color .15s",
              }}>
                {p.media_urls?.[0] && <img src={imgProxy(p.media_urls[0])} alt="" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />}
                <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 2 }}>{p.media_urls?.length || 0} รูป</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Product header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 14px", background: "rgba(0,255,212,.06)", border: "1px solid rgba(0,255,212,.2)", borderRadius: 12 }}>
            {product.media_urls?.[0] && <img src={imgProxy(product.media_urls[0])} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{product.name}</div>
              <div style={{ fontSize: 11, color: "var(--faint)" }}>{slots.length} คลิป · รวม {totalDuration} วิ</div>
            </div>
            <button onClick={() => { setProduct(null); setSlots([]); setSessionJobId(null); }} style={{ fontSize: 11, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}>เปลี่ยน</button>
          </div>

          {/* Clip slots */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {slots.map((slot, i) => {
              const imgUrl = product.media_urls[slot.imageIndex];
              const promptEmpty = !slot.prompt.trim();
              const promptThai = /[฀-๿]/.test(slot.prompt);
              return (
                <div key={i} style={{ background: "var(--glass)", border: `1px solid ${promptEmpty ? "rgba(255,77,106,.3)" : "var(--gb)"}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, padding: "12px 14px", alignItems: "flex-start" }}>

                    {/* Image + order */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--teal)", background: "rgba(0,255,212,.1)", borderRadius: 6, padding: "2px 8px", marginBottom: 4 }}>#{i + 1}</div>
                      {imgUrl && <img src={imgProxy(imgUrl)} alt="" style={{ width: 68, height: 120, objectFit: "cover", borderRadius: 8 }} />}
                      <div style={{ display: "flex", gap: 3 }}>
                        <button onClick={() => moveSlot(i, -1)} disabled={i === 0} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid var(--gb)", background: "transparent", cursor: i === 0 ? "not-allowed" : "pointer", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronUp size={10} /></button>
                        <button onClick={() => moveSlot(i, 1)} disabled={i === slots.length - 1} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid var(--gb)", background: "transparent", cursor: i === slots.length - 1 ? "not-allowed" : "pointer", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronDown size={10} /></button>
                      </div>
                    </div>

                    {/* Prompt */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                          Prompt คลิป #{i + 1}
                        </div>
                        {promptEmpty && <span style={{ fontSize: 9, fontWeight: 800, color: "var(--err)", background: "rgba(255,77,106,.12)", padding: "1px 6px", borderRadius: 4 }}>ว่างอยู่ — AI จะเขียนให้อัตโนมัติ</span>}
                        {!promptEmpty && promptThai && <span style={{ fontSize: 9, fontWeight: 800, color: "#f59e0b", background: "rgba(245,158,11,.12)", padding: "1px 6px", borderRadius: 4 }}>มีภาษาไทย — AI จะแปลให้ก่อน render</span>}
                      </div>
                      <textarea
                        value={slot.prompt}
                        onChange={e => updateSlot(i, { prompt: e.target.value })}
                        placeholder={aiModel === "kenburs" ? "ไม่จำเป็น — Ken Burns ไม่ใช้ prompt" : "พิมพ์ concept ได้เลย (ไทยก็ได้) AI จะแปลเป็น Hailuo prompt ให้ · หรือพิมพ์ English เลยก็ได้"}
                        rows={3}
                        style={{ width: "100%", background: "#1a1a22", border: `1px solid ${promptThai && !promptEmpty ? "rgba(245,158,11,.4)" : "var(--gb)"}`, borderRadius: 10, padding: "8px 12px", color: "var(--text)", fontSize: 12, outline: "none", fontFamily: "monospace", resize: "none", lineHeight: 1.6, boxSizing: "border-box" }}
                      />
                      {aiModel !== "kenburs" && (
                        <button onClick={() => suggestPrompt(i)} disabled={generating === i} style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--blue)", background: "rgba(77,127,255,.08)", border: "1px solid rgba(77,127,255,.2)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
                          {generating === i ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={10} />}
                          Gemini อ่านรูป → เขียน prompt ให้คลิปนี้
                        </button>
                      )}
                    </div>

                    {/* Duration */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 66 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>ความยาว</div>
                      {modelDef.durations.map(d => (
                        <button key={d} onClick={() => updateSlot(i, { duration: d })} style={{
                          padding: "5px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
                          border: `1.5px solid ${slot.duration === d ? modelDef.color : "var(--gb)"}`,
                          background: slot.duration === d ? `${modelDef.color}18` : "transparent",
                          color: slot.duration === d ? modelDef.color : "var(--faint)",
                        }}>{d}s</button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div style={{ background: "rgba(0,0,0,.2)", border: "1px solid var(--gb)", borderRadius: 12, padding: "14px 16px", marginBottom: 14, fontSize: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", color: "var(--faint)", lineHeight: 2.1 }}>
            <span>AI Model:</span><b style={{ color: modelDef.color }}>{modelDef.label} — {modelDef.outputLine1}</b>
            <span>จำนวนคลิป:</span><b style={{ color: "var(--dim)" }}>{slots.length} คลิป × {slots.map(s=>s.duration).join("/")} วิ = {totalDuration} วิ</b>
            {aiModel !== "kenburs" && <><span>ก่อน render:</span><b style={{ color: "var(--ok)" }}>Gemini อ่านรูป → เขียน prompt ทุกคลิปอัตโนมัติ</b></>}
            {aiModel !== "kenburs" && <><span>เสียงพากย์:</span><b style={{ color: "var(--ok)" }}>Gemini script + ElevenLabs voice</b></>}
            {aiModel !== "kenburs" && <><span>ราคาประมาณ:</span><b style={{ color: "#f87171" }}>${totalCost.toFixed(2)} (~{Math.round(totalCost * 35)} บาท)</b></>}
          </div>

          {/* AI hint */}
          {aiModel !== "kenburs" && (
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.25)", borderRadius: 10, fontSize: 11.5, color: "var(--dim)", lineHeight: 1.7 }}>
              <b style={{ color: "#A78BFA" }}>Flow อัตโนมัติเมื่อกด render:</b>{" "}
              Gemini Vision อ่านรูปแต่ละคลิป → เขียน / ปรับ prompt ให้ถูกต้องสำหรับ {modelDef.label} →
              สร้างวิดีโอทีละคลิป → ต่อเป็นวิดีโอเดียว + เสียงพากย์ AI
            </div>
          )}

          <button onClick={runRender} style={{
            width: "100%", padding: "15px", borderRadius: 14, cursor: "pointer",
            background: `linear-gradient(90deg,${modelDef.color},var(--blue))`, border: "none",
            color: "#06060A", fontSize: 15, fontWeight: 900,
            boxShadow: `0 6px 24px ${modelDef.color}40`,
          }}>
            {aiModel === "kenburs"
              ? `สร้าง Ken Burns ${slots.length} คลิป (ฟรี) →`
              : `สร้างวิดีโอ AI ${slots.length} คลิป ~${Math.round(totalCost * 35)} บาท →`
            }
          </button>

          {/* Wand icon hint */}
          {aiModel !== "kenburs" && slots.some(s => !s.prompt.trim()) && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--faint)" }}>
              <Wand2 size={12} />
              คลิปที่ยังว่าง Gemini จะอ่านรูปและเขียน prompt ให้อัตโนมัติเมื่อกด render
            </div>
          )}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
