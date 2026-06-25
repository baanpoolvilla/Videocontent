"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Loader2, Sparkles, ChevronUp, ChevronDown, CheckCircle2 } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }
type AIModel = "kenburs" | "hailuo2pro" | "kling3s";

interface ClipSlot {
  imageIndex: number;
  prompt: string;
  duration: number;
}

function imgProxy(url: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return url.startsWith("/") ? `${base}/api/v1/files/${url.slice(1)}` : url;
}

const MODEL_OPTIONS: { id: AIModel; label: string; price: string; color: string; maxDur: number }[] = [
  { id: "kenburs",    label: "Ken Burns (ฟรี)", price: "ฟรี",         color: "#22D499", maxDur: 15 },
  { id: "hailuo2pro", label: "Hailuo 2.3 Pro",  price: "$0.49/คลิป", color: "#A78BFA", maxDur: 10 },
  { id: "kling3s",    label: "Kling v3",          price: "$1.89/คลิป", color: "#00FFD4", maxDur: 10 },
];

export default function StoryboardPage() {
  const router = useRouter();
  const [products, setProducts]     = useState<Product[]>([]);
  const [product, setProduct]       = useState<Product | null>(null);
  const [slots, setSlots]           = useState<ClipSlot[]>([]);
  const [aiModel, setAiModel]       = useState<AIModel>("hailuo2pro");
  const [phase, setPhase]           = useState<"setup" | "rendering" | "done" | "error">("setup");
  const [renderStep, setRenderStep] = useState("");
  const [errMsg, setErrMsg]         = useState("");
  const [videoUrl, setVideoUrl]     = useState("");
  const [generating, setGenerating] = useState<number | null>(null);
  // ONE job per storyboard session — created lazily, reused for all calls
  const [sessionJobId, setSessionJobId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {});
  }, []);

  const selectProduct = (p: Product) => {
    setProduct(p);
    setSessionJobId(null); // reset job when switching product
    setSlots(p.media_urls.slice(0, 6).map((_, i) => ({
      imageIndex: i,
      prompt: "",
      duration: 5,
    })));
  };

  // Create a job once per session and cache it
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
    setSlots(prev => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const suggestPrompt = async (i: number) => {
    if (!product) return;
    setGenerating(i);
    try {
      // Reuse one job per session — no orphan jobs
      const jobId = await getOrCreateJob(product.id);
      const slot = slots[i];
      const imgPath = product.media_urls[slot.imageIndex];
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const publicImgUrl = imgPath.startsWith("/")
        ? `${base}/api/v1/files/${imgPath.slice(1)}`
        : imgPath;

      const r = await api.get(`/jobs/${jobId}/suggest-video-prompt`, {
        params: {
          style: "luxury",
          concept: slot.prompt,
          image_url: publicImgUrl,
        },
      });
      updateSlot(i, { prompt: r.data.video_prompt || "" });
    } catch { /* keep current prompt */ }
    setGenerating(null);
  };

  const maxDur = MODEL_OPTIONS.find(m => m.id === aiModel)?.maxDur ?? 10;
  const totalCost = aiModel === "kenburs" ? 0 : slots.length * (aiModel === "hailuo2pro" ? 0.49 : 1.89);
  const totalDuration = slots.reduce((s, c) => s + c.duration, 0);

  const runRender = async () => {
    if (!product || slots.length === 0) return;
    setPhase("rendering");
    setRenderStep("สร้าง script...");
    try {
      // Reuse session job
      const jobId = await getOrCreateJob(product.id);

      // 1. Generate script for voiceover
      setRenderStep("Gemini เขียน script...");
      await api.post(`/jobs/${jobId}/generate-script`, null, {
        params: { tone_of_voice: "luxury cinematic", duration_sec: totalDuration, concept: "" },
      });

      // 2. Generate voiceover from script
      setRenderStep("สร้างเสียงพากย์...");
      let voiceoverUrl = "";
      try {
        const voRes = await api.post(`/jobs/${jobId}/voiceover`, null, {
          params: { voice_style: "เป็นกันเอง (หญิง)" },
        });
        voiceoverUrl = (voRes.data as { voiceover_url?: string }).voiceover_url || "";
      } catch {
        // voiceover optional — continue without it
      }

      // 3. Story render with voiceover
      setRenderStep(`AI สร้าง ${slots.length} คลิป — รอ ${slots.length * 1}–${slots.length * 3} นาที...`);
      await api.post(`/jobs/${jobId}/story-render`, {
        clips: slots.map(s => ({
          image_index: s.imageIndex,
          prompt: s.prompt,
          duration_sec: Math.min(s.duration, maxDur), // cap at model max
        })),
        ai_model: aiModel,
        aspect_ratio: "9:16",
        voiceover_url: voiceoverUrl,
      });

      // 4. Poll for completion
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

  if (phase === "rendering") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "var(--bg)" }}>
      <Loader2 size={40} style={{ animation: "spin 1s linear infinite", color: "var(--teal)" }} />
      <div style={{ fontSize: 18, fontWeight: 800 }}>กำลังสร้างวิดีโอ...</div>
      <div style={{ fontSize: 13, color: "var(--faint)", maxWidth: 340, textAlign: "center" }}>{renderStep}</div>
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
      <div style={{ color: "var(--err)", fontSize: 14 }}>{errMsg}</div>
      <button onClick={() => setPhase("setup")} style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(255,77,106,.1)", border: "1px solid rgba(255,77,106,.2)", color: "var(--err)", cursor: "pointer" }}>ลองใหม่</button>
    </div>
  );

  return (
    <div className="page-enter" style={{ padding: "28px 40px", maxWidth: 900, margin: "0 auto" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>Story Mode</p>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800 }}>Storyboard Editor</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>แต่ละรูปมี prompt ของตัวเอง — AI สร้างคลิปต่างกันแล้ว concat เป็นวิดีโอเดียว</p>

      {/* Product selector */}
      {!product ? (
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dim)", marginBottom: 12 }}>เลือก Asset ก่อน:</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 10 }}>
            {products.map(p => (
              <button key={p.id} onClick={() => selectProduct(p)} style={{
                padding: "14px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                background: "var(--glass)", border: "1px solid var(--gb)",
                transition: "border-color .15s",
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
              return (
                <div key={i} style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, padding: "12px 14px", alignItems: "flex-start" }}>

                    {/* Image + order */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--teal)", background: "rgba(0,255,212,.1)", borderRadius: 6, padding: "2px 8px", marginBottom: 4 }}>คลิป {i + 1}</div>
                      {imgUrl && <img src={imgProxy(imgUrl)} alt="" style={{ width: 70, height: 124, objectFit: "cover", borderRadius: 8 }} />}
                      <div style={{ display: "flex", gap: 3 }}>
                        <button onClick={() => moveSlot(i, -1)} disabled={i === 0} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid var(--gb)", background: "transparent", cursor: i === 0 ? "not-allowed" : "pointer", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronUp size={10} /></button>
                        <button onClick={() => moveSlot(i, 1)} disabled={i === slots.length - 1} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid var(--gb)", background: "transparent", cursor: i === slots.length - 1 ? "not-allowed" : "pointer", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronDown size={10} /></button>
                      </div>
                    </div>

                    {/* Prompt */}
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Prompt คลิปนี้ (English)</div>
                      <textarea
                        value={slot.prompt}
                        onChange={e => updateSlot(i, { prompt: e.target.value })}
                        placeholder="เช่น: Slow crane shot over infinity pool at golden hour, cinematic 4K..."
                        rows={4}
                        style={{ width: "100%", background: "#1a1a22", border: "1px solid var(--gb)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 12, outline: "none", fontFamily: "monospace", resize: "none", lineHeight: 1.6, boxSizing: "border-box" }}
                      />
                      <button onClick={() => suggestPrompt(i)} disabled={generating === i} style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--blue)", background: "rgba(77,127,255,.08)", border: "1px solid rgba(77,127,255,.2)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
                        {generating === i ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={10} />}
                        AI เขียน prompt ให้ (Gemini อ่านรูปจริง)
                      </button>
                    </div>

                    {/* Duration */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 70 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>วิ/คลิป</div>
                      {[5, 10, ...(maxDur >= 15 ? [15] : [])].map(d => (
                        <button key={d} onClick={() => updateSlot(i, { duration: Math.min(d, maxDur) })} style={{
                          padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
                          border: `1.5px solid ${slot.duration === d ? "var(--teal)" : "var(--gb)"}`,
                          background: slot.duration === d ? "rgba(0,255,212,.1)" : "transparent",
                          color: slot.duration === d ? "var(--teal)" : "var(--faint)",
                        }}>{d}s</button>
                      ))}
                      {maxDur < 15 && (
                        <div style={{ fontSize: 9, color: "var(--faint)", textAlign: "center", lineHeight: 1.3 }}>max {maxDur}s สำหรับ AI</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Model selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", marginBottom: 8 }}>AI Model</div>
            <div style={{ display: "flex", gap: 8 }}>
              {MODEL_OPTIONS.map(m => (
                <button key={m.id} onClick={() => {
                  setAiModel(m.id);
                  // cap existing slot durations to new model's max
                  setSlots(prev => prev.map(s => ({ ...s, duration: Math.min(s.duration, m.maxDur) })));
                }} style={{
                  flex: 1, padding: "10px 12px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                  border: `1.5px solid ${aiModel === m.id ? m.color : "var(--gb)"}`,
                  background: aiModel === m.id ? m.color + "18" : "transparent", transition: "all .15s",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: aiModel === m.id ? m.color : "var(--dim)" }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{m.price}</div>
                  <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 1 }}>max {m.maxDur}s/คลิป</div>
                </button>
              ))}
            </div>
          </div>

          {/* Summary + render */}
          <div style={{ background: "rgba(0,0,0,.2)", border: "1px solid var(--gb)", borderRadius: 12, padding: "14px 16px", marginBottom: 14, fontSize: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", color: "var(--faint)", lineHeight: 2 }}>
            <span>จำนวนคลิป:</span><b style={{ color: "var(--dim)" }}>{slots.length} คลิป</b>
            <span>รวม:</span><b style={{ color: "var(--dim)" }}>{totalDuration} วินาที</b>
            <span>เสียงพากย์:</span><b style={{ color: "var(--ok)" }}>อัตโนมัติ (Gemini + ElevenLabs)</b>
            {aiModel !== "kenburs" && <><span>ราคาประมาณ:</span><b style={{ color: "#f87171" }}>${totalCost.toFixed(2)} (~{Math.round(totalCost * 35)} บาท)</b></>}
          </div>

          <button onClick={runRender} style={{
            width: "100%", padding: "15px", borderRadius: 14, cursor: "pointer",
            background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none",
            color: "#06060A", fontSize: 15, fontWeight: 900,
            boxShadow: "0 6px 24px rgba(0,255,212,.3)",
          }}>
            {aiModel === "kenburs" ? "สร้างวิดีโอ (ฟรี) →" : `สร้างวิดีโอ ${slots.length} คลิป ~${Math.round(totalCost * 35)} บาท →`}
          </button>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
