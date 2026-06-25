"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Loader2, Sparkles, ChevronUp, ChevronDown, CheckCircle2, Wand2, X, Plus } from "lucide-react";

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
  promptLimit: number | null;
  minDuration: number;
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
    promptLimit: null,
    minDuration: 5,
  },
  {
    id: "hailuo2pro",
    label: "Hailuo 2.3 Pro",
    price: "$0.49 / คลิป",
    color: "#A78BFA",
    durations: [6, 10],
    badge: "AI VIDEO",
    outputLine1: "AI สร้างการเคลื่อนไหวจริงจากรูป",
    outputLine2: "water ripple · camera dolly · bokeh · atmosphere",
    stars: 4,
    promptLimit: 2000,
    minDuration: 6,
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
    promptLimit: 2500,
    minDuration: 5,
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

type PromptState = "empty" | "thai" | "short" | "toolong" | "good";

function getPromptStatus(prompt: string): { state: PromptState; label: string; color: string; borderColor: string } {
  if (!prompt.trim())
    return { state: "empty", label: "ว่าง — AI เขียนให้อัตโนมัติ", color: "rgba(255,77,106,.9)", borderColor: "rgba(255,77,106,.35)" };
  if (/[฀-๿]/.test(prompt))
    return { state: "thai", label: "ภาษาไทย — AI แปลให้ก่อน render", color: "#f59e0b", borderColor: "rgba(245,158,11,.35)" };
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (words < 8)
    return { state: "short", label: `${words} คำ — AI ขยาย prompt ให้ถูกรูปแบบ`, color: "#f59e0b", borderColor: "rgba(245,158,11,.35)" };
  if (prompt.length > 1900)
    return { state: "toolong", label: `ยาวเกิน — จะถูกตัดที่ 2000 ตัวอักษร!`, color: "rgba(255,77,106,.9)", borderColor: "rgba(255,77,106,.35)" };
  return { state: "good", label: "✅ concept ดี — Gemini รักษาไว้ + เพิ่ม cinematic detail", color: "#22D499", borderColor: "rgba(34,212,153,.2)" };
}

export default function StoryboardPage() {
  const router = useRouter();
  const [products, setProducts]         = useState<Product[]>([]);
  const [product, setProduct]           = useState<Product | null>(null);
  const [slots, setSlots]               = useState<ClipSlot[]>([]);
  const [aiModel, setAiModel]           = useState<AIModel>("hailuo2pro");
  const [phase, setPhase]               = useState<"setup" | "rendering" | "done" | "error">("setup");
  const [renderStep, setRenderStep]     = useState("");
  const [errMsg, setErrMsg]             = useState("");
  const [videoUrl, setVideoUrl]         = useState("");
  const [generating, setGenerating]     = useState<number | null>(null);
  const [sessionJobId, setSessionJobId] = useState<string | null>(null);
  const [imgPickerOpen, setImgPickerOpen] = useState<number | null>(null);

  const modelDef = MODELS.find(m => m.id === aiModel)!;

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {});
  }, []);

  const selectProduct = (p: Product) => {
    setProduct(p);
    setSessionJobId(null);
    setImgPickerOpen(null);
    const defaultDur = MODELS.find(m => m.id === aiModel)!.durations[0];
    setSlots(p.media_urls.slice(0, 6).map((_, i) => ({ imageIndex: i, prompt: "", duration: defaultDur })));
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

  const removeSlot = (i: number) => {
    if (slots.length <= 1) return;
    setSlots(prev => prev.filter((_, idx) => idx !== i));
    if (imgPickerOpen === i) setImgPickerOpen(null);
  };

  const addSlot = () => {
    if (!product) return;
    const usedSet = new Set(slots.map(s => s.imageIndex));
    const nextFree = product.media_urls.findIndex((_, idx) => !usedSet.has(idx));
    const addIdx = nextFree >= 0 ? nextFree : slots.length % product.media_urls.length;
    setSlots(prev => [...prev, { imageIndex: addIdx, prompt: "", duration: modelDef.durations[0] }]);
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
        params: { style: "luxury", concept: slots[i].prompt, image_url: slotImgUrl(slots[i]), ai_model: aiModel },
      });
      updateSlot(i, { prompt: r.data.video_prompt || "" });
    } catch { /* keep */ }
    setGenerating(null);
  };

  // Auto-enhance: ALL slots go through Gemini — user's text becomes the "concept" anchor,
  // Gemini reads the image + concept and writes a detailed 110-130 word cinematic prompt.
  // This ensures every clip gets proper camera/light/motion keywords regardless of what the user typed.
  const autoEnhanceAll = async (jobId: string, currentSlots: ClipSlot[]): Promise<ClipSlot[]> => {
    const enhanced = [...currentSlots];
    for (let i = 0; i < enhanced.length; i++) {
      const slot = enhanced[i];
      try {
        const r = await api.get(`/jobs/${jobId}/suggest-video-prompt`, {
          params: {
            style: "luxury",
            concept: slot.prompt,
            image_url: slotImgUrl(slot),
            ai_model: aiModel,
          },
        });
        if (r.data.video_prompt) {
          enhanced[i] = { ...slot, prompt: r.data.video_prompt };
        }
      } catch { /* keep original on error */ }
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

      if (aiModel !== "kenburs") {
        // 1. Enhance ALL prompts — Gemini reads each image + user's concept → 110+ word cinematic prompt
        setRenderStep(`Gemini Vision อ่านรูป ${slots.length} คลิป และเขียน prompt ละเอียด...`);
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

        // 4. Story render with enhanced prompts (pass `enhanced` directly, not stale state)
        setRenderStep(`${aiModel === "hailuo2pro" ? "Hailuo" : "Kling"} render ${slots.length} คลิป... รอ ${slots.length * 1}–${slots.length * 3} นาที`);
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
        setRenderStep("สร้างวิดีโอ Ken Burns...");
        await api.post(`/jobs/${jobId}/story-render`, {
          clips: slots.map(s => ({ image_index: s.imageIndex, prompt: "", duration_sec: s.duration })),
          ai_model: "kenburs",
          aspect_ratio: "9:16",
          voiceover_url: "",
        });
      }

      // 5. Poll for completion
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
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>
        แต่ละคลิปมี prompt ของตัวเอง · พิมพ์ English ดีๆ → ส่งตรงไป AI โดยไม่เปลี่ยน · พิมพ์ไทยหรือเว้นว่าง → Gemini แปล/เขียนให้
      </p>

      {/* ── Model selector ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
          เลือก AI Model
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

        {/* Model constraints strip */}
        <div style={{ marginTop: 10, padding: "10px 14px", background: `${modelDef.color}0e`, border: `1px solid ${modelDef.color}30`, borderRadius: 10, fontSize: 11.5 }}>
          <span style={{ fontWeight: 800, color: modelDef.color }}>{modelDef.label}</span>
          <span style={{ color: "var(--dim)", marginLeft: 8 }}>
            ความยาว: <b>{modelDef.durations.map(d => `${d}s`).join(", ")}</b>
          </span>
          {modelDef.promptLimit && (
            <span style={{ color: "var(--dim)", marginLeft: 8 }}>
              · Prompt สูงสุด: <b>{modelDef.promptLimit.toLocaleString()} ตัวอักษร</b>
            </span>
          )}
          <span style={{ color: "var(--faint)", marginLeft: 8 }}>
            · <b>1 รูป / 1 คลิป</b> (Gemini อ่านรูป + prompt ของคุณ)
          </span>
          {modelDef.id !== "kenburs" && (
            <span style={{ color: "var(--faint)", marginLeft: 8 }}>
              · ทุกคลิปผ่าน Gemini Vision (อ่านรูป + รักษา concept) → prompt ~120 คำ
            </span>
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
              <div style={{ fontSize: 11, color: "var(--faint)" }}>{slots.length} คลิป · รวม {totalDuration} วิ · {product.media_urls.length} รูป</div>
            </div>
            <button onClick={() => { setProduct(null); setSlots([]); setSessionJobId(null); }} style={{ fontSize: 11, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}>เปลี่ยน</button>
          </div>

          {/* Clip slots */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            {slots.map((slot, i) => {
              const imgUrl = product.media_urls[slot.imageIndex];
              const ps = aiModel === "kenburs" ? null : getPromptStatus(slot.prompt);
              const charCount = slot.prompt.length;
              const charLimit = modelDef.promptLimit;
              const charColor = !charLimit ? "var(--faint)"
                : charCount > 1900 ? "rgba(255,77,106,.9)"
                : charCount > 1500 ? "#f59e0b"
                : "var(--faint)";

              return (
                <div key={i} style={{
                  background: "var(--glass)",
                  border: `1px solid ${ps ? ps.borderColor : "var(--gb)"}`,
                  borderRadius: 14, overflow: "visible",
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, padding: "12px 14px", alignItems: "flex-start" }}>

                    {/* Image + order + image picker */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--teal)", background: "rgba(0,255,212,.1)", borderRadius: 6, padding: "2px 8px" }}>#{i + 1}</div>
                        {slots.length > 1 && (
                          <button onClick={() => removeSlot(i)} title="ลบคลิปนี้" style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid rgba(255,77,106,.3)", background: "rgba(255,77,106,.06)", cursor: "pointer", color: "rgba(255,77,106,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                            <X size={9} />
                          </button>
                        )}
                      </div>

                      {/* Current image — click to open picker */}
                      <div style={{ position: "relative" }}>
                        {imgUrl && (
                          <img
                            src={imgProxy(imgUrl)}
                            alt=""
                            onClick={() => setImgPickerOpen(imgPickerOpen === i ? null : i)}
                            style={{ width: 68, height: 120, objectFit: "cover", borderRadius: 8, cursor: product.media_urls.length > 1 ? "pointer" : "default", border: imgPickerOpen === i ? "2px solid var(--teal)" : "2px solid transparent" }}
                          />
                        )}
                        {product.media_urls.length > 1 && (
                          <div onClick={() => setImgPickerOpen(imgPickerOpen === i ? null : i)} style={{ fontSize: 8, fontWeight: 700, textAlign: "center", color: "var(--faint)", cursor: "pointer", marginTop: 2, letterSpacing: ".03em" }}>
                            {imgPickerOpen === i ? "✕ ปิด" : "เปลี่ยนรูป"}
                          </div>
                        )}
                      </div>

                      {/* Image picker grid */}
                      {imgPickerOpen === i && product.media_urls.length > 1 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, width: 148, marginTop: 4, padding: 6, background: "rgba(0,0,0,.5)", borderRadius: 8, border: "1px solid var(--gb)" }}>
                          {product.media_urls.map((url, idx) => (
                            <img
                              key={idx}
                              src={imgProxy(url)}
                              alt=""
                              onClick={() => { updateSlot(i, { imageIndex: idx }); setImgPickerOpen(null); }}
                              style={{
                                width: 40, height: 70, objectFit: "cover", borderRadius: 5, cursor: "pointer",
                                border: `2px solid ${slot.imageIndex === idx ? "var(--teal)" : "transparent"}`,
                                opacity: slot.imageIndex === idx ? 1 : 0.55,
                                transition: "opacity .1s, border-color .1s",
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Move up/down */}
                      <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                        <button onClick={() => moveSlot(i, -1)} disabled={i === 0} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid var(--gb)", background: "transparent", cursor: i === 0 ? "not-allowed" : "pointer", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronUp size={10} /></button>
                        <button onClick={() => moveSlot(i, 1)} disabled={i === slots.length - 1} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid var(--gb)", background: "transparent", cursor: i === slots.length - 1 ? "not-allowed" : "pointer", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronDown size={10} /></button>
                      </div>
                    </div>

                    {/* Prompt area */}
                    <div>
                      {/* Header row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                          Prompt คลิป #{i + 1}
                        </div>
                        {ps && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: ps.color, background: `${ps.color}18`, padding: "1px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>
                            {ps.label}
                          </span>
                        )}
                      </div>

                      {/* Textarea with char counter */}
                      <div style={{ position: "relative" }}>
                        <textarea
                          value={slot.prompt}
                          onChange={e => updateSlot(i, { prompt: e.target.value })}
                          placeholder={
                            aiModel === "kenburs"
                              ? "ไม่จำเป็น — Ken Burns ไม่ใช้ prompt"
                              : "พิมพ์ prompt เป็น English ตรงๆ ได้เลย (8+ คำ → ใช้โดยไม่เปลี่ยน)\nหรือพิมพ์ไทย / เขียนสั้นๆ → AI แปลและขยายให้"
                          }
                          rows={3}
                          style={{
                            width: "100%", background: "#1a1a22",
                            border: `1px solid ${ps ? ps.borderColor : "var(--gb)"}`,
                            borderRadius: 10, padding: "8px 12px", paddingBottom: aiModel !== "kenburs" ? "22px" : "8px",
                            color: "var(--text)", fontSize: 12, outline: "none",
                            fontFamily: "monospace", resize: "none", lineHeight: 1.6, boxSizing: "border-box",
                          }}
                        />
                        {aiModel !== "kenburs" && charLimit && (
                          <div style={{ position: "absolute", bottom: 5, right: 8, fontSize: 9, color: charColor, pointerEvents: "none", fontWeight: charCount > 1900 ? 800 : 400 }}>
                            {charCount}/{charLimit}
                          </div>
                        )}
                      </div>

                      {/* AI suggest button */}
                      {aiModel !== "kenburs" && (
                        <button onClick={() => suggestPrompt(i)} disabled={generating === i} style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--blue)", background: "rgba(77,127,255,.08)", border: "1px solid rgba(77,127,255,.2)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
                          {generating === i ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={10} />}
                          Gemini อ่านรูป → เขียน prompt ใหม่ให้คลิปนี้
                        </button>
                      )}

                      {/* "What happens" info for good prompts */}
                      {ps?.state === "good" && (
                        <div style={{ marginTop: 5, fontSize: 10, color: "#22D499", opacity: .7 }}>
                          Gemini จะรักษา concept นี้ไว้ทั้งหมด + เพิ่ม camera move / lighting / atmosphere ให้วิดีโอสวยขึ้น
                        </div>
                      )}
                    </div>

                    {/* Duration selector */}
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
                      {modelDef.id === "hailuo2pro" && (
                        <div style={{ fontSize: 8, color: "var(--faint)", lineHeight: 1.4, marginTop: 2 }}>min 6s<br/>API limit</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add slot button */}
          <button
            onClick={addSlot}
            style={{
              width: "100%", padding: "10px", borderRadius: 12, cursor: "pointer",
              border: "1.5px dashed rgba(0,255,212,.3)", background: "rgba(0,255,212,.04)",
              color: "var(--teal)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 16,
            }}
          >
            <Plus size={13} />
            เพิ่มคลิป ({slots.length} → {slots.length + 1}) · มีรูป {product.media_urls.length} รูป
          </button>

          {/* Summary */}
          <div style={{ background: "rgba(0,0,0,.2)", border: "1px solid var(--gb)", borderRadius: 12, padding: "14px 16px", marginBottom: 14, fontSize: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", color: "var(--faint)", lineHeight: 2.1 }}>
            <span>AI Model:</span><b style={{ color: modelDef.color }}>{modelDef.label} — {modelDef.outputLine1}</b>
            <span>จำนวนคลิป:</span><b style={{ color: "var(--dim)" }}>{slots.length} คลิป × {slots.map(s=>s.duration).join("/")} วิ = {totalDuration} วิ</b>
            {aiModel !== "kenburs" && <><span>ทุก prompt ก่อน render:</span><b style={{ color: "#22D499" }}>Gemini อ่านรูป + concept ที่คุณเขียน → prompt 110+ คำ</b></>}
            {aiModel !== "kenburs" && <><span>concept ของคุณ:</span><b style={{ color: "#f59e0b" }}>ถูกรักษาไว้เป็น scene หลัก — Gemini เพิ่ม cinematic detail รอบๆ</b></>}
            {aiModel !== "kenburs" && <><span>Prompt limit:</span><b style={{ color: "var(--dim)" }}>{modelDef.promptLimit?.toLocaleString()} ตัวอักษร · 1 รูป/คลิป</b></>}
            {aiModel !== "kenburs" && <><span>เสียงพากย์:</span><b style={{ color: "var(--ok)" }}>Gemini script + ElevenLabs voice</b></>}
            {aiModel !== "kenburs" && <><span>ราคาประมาณ:</span><b style={{ color: "#f87171" }}>${totalCost.toFixed(2)} (~{Math.round(totalCost * 35)} บาท)</b></>}
          </div>

          {/* AI hint */}
          {aiModel !== "kenburs" && (
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.25)", borderRadius: 10, fontSize: 11.5, color: "var(--dim)", lineHeight: 1.8 }}>
              <b style={{ color: "#A78BFA" }}>Flow อัตโนมัติเมื่อกด render:</b>
              {" "}คลิปที่มี <b>English 8+ คำ</b> → ส่งตรงไป {modelDef.label} โดยไม่เปลี่ยน
              {" "}· คลิปที่ว่าง / มีภาษาไทย / สั้นกว่า 8 คำ → Gemini อ่านรูป + concept → เขียน prompt ให้ →
              {" "}สร้างวิดีโอทีละคลิป → ต่อเป็นวิดีโอเดียว + เสียงพากย์ AI
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
