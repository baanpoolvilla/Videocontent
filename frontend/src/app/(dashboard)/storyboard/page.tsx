"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Loader2, Sparkles, ChevronUp, ChevronDown, CheckCircle2, Wand2, X, Plus } from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }

// Key must match wan.py MODELS dict exactly — step 3 of "add a new model"
type AIModel = "kenburs" | "hailuo2pro" | "kling3s" | "kling3s_pro" | "seedance2" | "seedance2_pro" | "wan21";

interface ClipSlot {
  imageIndex: number;
  prompt: string;
  duration: number;
  label: string;
}

interface ModelDef {
  id: AIModel;
  label: string;
  pricePerClip: number;    // used for cost calculation
  price: string;           // display string
  color: string;
  durations: number[];
  badge: string;
  outputLine1: string;
  outputLine2: string;
  stars: number;
  promptLimit: number | null;
  minDuration: number;
  isAI: boolean;           // false = Ken Burns (no Gemini, no fal.ai)
}

// ─── TO ADD A NEW MODEL — add one entry here ─────────────────────────────────
// id must match wan.py MODELS key · also update ai.py model_label dict
const MODELS: ModelDef[] = [
  {
    id: "kenburs",
    label: "Ken Burns",
    pricePerClip: 0,
    price: "ฟรี",
    color: "#6EE7B7",
    durations: [5, 10, 15, 20, 30],
    badge: "FREE",
    outputLine1: "รูปซูม / เลื่อนอัตโนมัติ",
    outputLine2: "FFmpeg — ไม่ใช่ AI จริง ไม่มีการเคลื่อนไหว",
    stars: 1,
    promptLimit: null,
    minDuration: 5,
    isAI: false,
  },
  {
    id: "hailuo2pro",
    label: "Hailuo 2.3 Pro",
    pricePerClip: 0.49,
    price: "$0.49 / คลิป",
    color: "#A78BFA",
    durations: [6, 10],
    badge: "AI · $0.49",
    outputLine1: "smooth motion · atmosphere · bokeh",
    outputLine2: "ripple · dolly · light shimmer · cinematic",
    stars: 4,
    promptLimit: 2000,
    minDuration: 6,
    isAI: true,
  },
  {
    id: "wan21",
    label: "Wan 2.1",
    pricePerClip: 0.30,
    price: "$0.30 / คลิป",
    color: "#34D399",
    durations: [5, 10],
    badge: "AI · $0.30",
    outputLine1: "ราคาประหยัด · motion ดี · เข้าใจ prompt ได้ดี",
    outputLine2: "versatile · scene · outdoor · indoor",
    stars: 3,
    promptLimit: 2000,
    minDuration: 5,
    isAI: true,
  },
  {
    id: "kling3s",
    label: "Kling v3 Standard",
    pricePerClip: 1.89,
    price: "$1.89 / คลิป",
    color: "#00FFD4",
    durations: [5, 10],
    badge: "AI · $1.89",
    outputLine1: "realism สูง · ตามใจ prompt มาก",
    outputLine2: "motion ซับซ้อน · คมชัด · สมจริง",
    stars: 4,
    promptLimit: 2500,
    minDuration: 5,
    isAI: true,
  },
  {
    id: "kling3s_pro",
    label: "Kling v3 Pro",
    pricePerClip: 2.88,
    price: "$2.88 / คลิป",
    color: "#818CF8",
    durations: [5, 10],
    badge: "AI · $2.88",
    outputLine1: "Kling คุณภาพสูงสุด — ระดับภาพยนตร์",
    outputLine2: "fine detail · complex motion · studio grade",
    stars: 5,
    promptLimit: 2500,
    minDuration: 5,
    isAI: true,
  },
  {
    id: "seedance2",
    label: "Seedance 2.0 Turbo",
    pricePerClip: 2.43,
    price: "$2.43 / คลิป",
    color: "#FB923C",
    durations: [5, 10],
    badge: "AI · $2.43",
    outputLine1: "ByteDance · เร็ว · สมจริง",
    outputLine2: "outdoor · คน · natural motion · lifestyle",
    stars: 4,
    promptLimit: 2000,
    minDuration: 5,
    isAI: true,
  },
  {
    id: "seedance2_pro",
    label: "Seedance 2.0 Standard",
    pricePerClip: 4.25,
    price: "$4.25 / คลิป",
    color: "#F43F5E",
    durations: [5, 10],
    badge: "AI · $4.25",
    outputLine1: "ByteDance · คุณภาพสูงสุด · detail มาก",
    outputLine2: "cinematic realism · best from ByteDance",
    stars: 5,
    promptLimit: 2000,
    minDuration: 5,
    isAI: true,
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

const VIDEO_TYPES = [
  { id: "รีวิวบ้าน",         icon: "🏠", desc: "แนะนำห้องต่างๆ มีผู้บรรยาย" },
  { id: "Luxury Showcase",  icon: "✨", desc: "cinematic สวยหรู ไม่มีคนพูด" },
  { id: "ปาร์ตี้/เฮฮา",     icon: "🎉", desc: "สนุก energetic บรรยากาศงาน" },
  { id: "โปรโมทราคา",       icon: "💰", desc: "เน้นราคา / โปรโมชัน / CTA" },
];

export default function StoryboardPage() {
  const router = useRouter();
  const [products, setProducts]         = useState<Product[]>([]);
  const [product, setProduct]           = useState<Product | null>(null);
  const [slots, setSlots]               = useState<ClipSlot[]>([]);
  const [aiModel, setAiModel]           = useState<AIModel>("hailuo2pro");
  const [phase, setPhase]               = useState<"product_select" | "questions" | "ai_generating" | "setup" | "rendering" | "done" | "error">("product_select");
  const [renderStep, setRenderStep]     = useState("");
  const [errMsg, setErrMsg]             = useState("");
  const [videoUrl, setVideoUrl]         = useState("");
  const [generating, setGenerating]     = useState<number | null>(null);
  const [sessionJobId, setSessionJobId] = useState<string | null>(null);
  const [imgPickerOpen, setImgPickerOpen] = useState<number | null>(null);
  const [modelOpen, setModelOpen]         = useState(false);

  // Guided questions state
  const [videoType, setVideoType]       = useState("รีวิวบ้าน");
  const [focusInput, setFocusInput]     = useState("");
  const [targetDuration, setTargetDuration] = useState(30);

  // Audio mode
  const [audioMode, setAudioMode]       = useState<"ai" | "upload" | "none">("ai");
  const [aiVoice, setAiVoice]           = useState("หญิง (ไทย)");
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");

  const modelDef = MODELS.find(m => m.id === aiModel)!;

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {});
  }, []);

  const selectProduct = (p: Product) => {
    setProduct(p);
    setSessionJobId(null);
    setImgPickerOpen(null);
    setPhase("questions");
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
    setSlots(prev => [...prev, { imageIndex: addIdx, prompt: "", duration: modelDef.durations[0], label: "" }]);
  };

  // Build public image URL for a given slot
  const slotImgUrl = (slot: ClipSlot): string => {
    if (!product) return "";
    const imgPath = product.media_urls[slot.imageIndex] || "";
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return imgPath.startsWith("/") ? `${base}/api/v1/files/${imgPath.slice(1)}` : imgPath;
  };

  const generateAIStoryboard = async () => {
    if (!product) return;
    setPhase("ai_generating");
    try {
      const jobId = await getOrCreateJob(product.id);
      const r = await api.post(`/jobs/${jobId}/ai-storyboard`, null, {
        params: { video_type: videoType, focus: focusInput, duration_sec: targetDuration, ai_model: aiModel },
      });
      const clips: { image_index: number; label: string; concept: string; duration_sec: number }[] = r.data.clips || [];
      const defaultDur = MODELS.find(m => m.id === aiModel)!.durations[0];
      setSlots(clips.map(c => ({
        imageIndex: Math.min(c.image_index, product.media_urls.length - 1),
        prompt: c.concept || "",
        duration: MODELS.find(m => m.id === aiModel)!.durations.includes(c.duration_sec) ? c.duration_sec : defaultDur,
        label: c.label || "",
      })));
      setPhase("setup");
    } catch (e) {
      // fallback: distribute images evenly
      const defaultDur = MODELS.find(m => m.id === aiModel)!.durations[0];
      setSlots(product.media_urls.slice(0, 6).map((_, i) => ({
        imageIndex: i, prompt: "", duration: defaultDur, label: "",
      })));
      setPhase("setup");
    }
  };

  const uploadAudio = async (file: File) => {
    if (!product) return;
    setUploadingAudio(true);
    try {
      const jobId = await getOrCreateJob(product.id);
      const formData = new FormData();
      formData.append("file", file);
      const r = await api.post(`/jobs/${jobId}/upload-audio`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadedAudioUrl(r.data.url || "");
      setUploadedFileName(file.name);
    } catch { setUploadedAudioUrl(""); }
    setUploadingAudio(false);
  };

  const suggestPrompt = async (i: number) => {
    if (!product) return;
    setGenerating(i);
    try {
      const jobId = await getOrCreateJob(product.id);
      const r = await api.get(`/jobs/${jobId}/suggest-video-prompt`, {
        params: { style: "luxury", concept: slots[i].prompt, image_url: slotImgUrl(slots[i]), ai_model: aiModel, slot_index: i, total_slots: slots.length },
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
            slot_index: i,
            total_slots: enhanced.length,
          },
        });
        if (r.data.video_prompt) {
          enhanced[i] = { ...slot, prompt: r.data.video_prompt };
        }
      } catch { /* keep original on error */ }
    }
    return enhanced;
  };

  const totalCost = modelDef.pricePerClip * slots.length;
  const totalDuration = slots.reduce((s, c) => s + c.duration, 0);

  const runRender = async () => {
    if (!product || slots.length === 0) return;
    setPhase("rendering");
    try {
      const jobId = await getOrCreateJob(product.id);
      let enhancedSlots = slots;

      if (modelDef.isAI) {
        // Step 1: Enhance prompts — Gemini reads each image + concept → 140-155 word cinematic prompt
        setRenderStep(`Gemini Vision อ่านรูป ${slots.length} คลิป เขียน prompt ละเอียด...`);
        enhancedSlots = await autoEnhanceAll(jobId, slots);
        setSlots(enhancedSlots);

        // Step 2: Generate script now (needed for AI voice later)
        if (audioMode === "ai") {
          setRenderStep("Gemini เขียน script เสียงพากย์...");
          const scenesJson = JSON.stringify(enhancedSlots.map((s, idx) => s.label.trim() || `Scene ${idx + 1}`));
          await api.post(`/jobs/${jobId}/generate-script`, null, {
            params: { tone_of_voice: "luxury cinematic", duration_sec: totalDuration, concept: videoType, scenes: scenesJson },
          }).catch(() => {});
        }
      }

      // Step 3: Render video WITHOUT audio — audio is mixed separately after
      setRenderStep(modelDef.isAI
        ? `${modelDef.label} render ${slots.length} คลิป... รอ ${slots.length * 1}–${slots.length * 4} นาที`
        : "Ken Burns สร้างวิดีโอ..."
      );
      await api.post(`/jobs/${jobId}/story-render`, {
        clips: enhancedSlots.map(s => ({
          image_index: s.imageIndex,
          prompt: modelDef.isAI ? s.prompt : "",
          duration_sec: Math.min(s.duration, modelDef.durations[modelDef.durations.length - 1]),
          label: s.label || "",
        })),
        ai_model: aiModel,
        aspect_ratio: "9:16",
        voiceover_url: "",
      });

      // Step 4: Poll until video done
      setRenderStep("รอ render วิดีโอ...");
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const j = await api.get(`/jobs/${jobId}`);
        if (j.data.status === "failed") throw new Error(j.data.error_message || "Render failed");
        if (j.data.status === "completed") break;
      }

      // Step 5: Mix audio separately (video is done, now add sound)
      if (audioMode === "ai") {
        setRenderStep("Edge TTS สร้างเสียงพากย์ภาษาไทย...");
        try {
          await api.post(`/jobs/${jobId}/remix-audio`, null, {
            params: { voice_style: aiVoice },
          });
          setRenderStep("ผสมเสียงเข้าวิดีโอ...");
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const j = await api.get(`/jobs/${jobId}`);
            if (j.data.status === "failed") break;
            if (j.data.status === "completed") break;
          }
        } catch { /* audio failed — still show silent video */ }
      } else if (audioMode === "upload" && uploadedAudioUrl) {
        setRenderStep("ผสมเสียงที่อัพโหลดเข้าวิดีโอ...");
        await api.post(`/jobs/${jobId}/remix-audio`, null, {
          params: { voiceover_url: uploadedAudioUrl },
        });
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const j = await api.get(`/jobs/${jobId}`);
          if (j.data.status === "failed") throw new Error(j.data.error_message || "Audio remix failed");
          if (j.data.status === "completed") break;
        }
      }

      // Step 6: Get latest completed render
      const renders = await api.get(`/jobs/${jobId}/renders`);
      const done = (renders.data as { status: string; final_video_url?: string }[])
        .find(r => r.status === "completed" && r.final_video_url);
      if (done?.final_video_url) setVideoUrl(imgProxy(done.final_video_url));

      setPhase("done");
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setPhase("error");
    }
  };

  /* ─── AI generating storyboard screen ─── */
  if (phase === "ai_generating") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, background: "var(--bg)", padding: 32 }}>
      <Loader2 size={44} style={{ animation: "spin 1s linear infinite", color: "var(--teal)" }} />
      <div style={{ fontSize: 20, fontWeight: 900 }}>Gemini กำลังวาง storyboard...</div>
      <div style={{ padding: "12px 20px", background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 12, fontSize: 13, color: "var(--dim)", maxWidth: 360, textAlign: "center", lineHeight: 1.7 }}>
        Gemini อ่านคำตอบของคุณ → วางแผน scene ต่อคลิป → เลือกรูป → เขียน concept ให้แต่ละ scene
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

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
    <div style={{ height: "100vh", background: "radial-gradient(ellipse 80% 55% at 5% -5%, rgba(0,255,212,.07) 0%, transparent 50%), radial-gradient(ellipse 70% 45% at 95% 105%, rgba(77,127,255,.06) 0%, transparent 50%), var(--bg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: "14px 20px 0", display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(0,255,212,.5)" }}>Story Mode</p>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--text)", letterSpacing: "-.02em" }}>Storyboard Editor</h1>
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.55, maxWidth: 520 }}>
          แต่ละคลิปมี prompt ของตัวเอง · Gemini อ่านรูป + concept → เขียน prompt ละเอียด → ส่งไป AI Model
        </p>
      </div>

      {/* 2-column body */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 12, padding: "12px 20px 16px" }}>

        {/* LEFT sidebar: model + controls */}
        <div style={{
          width: 268, flexShrink: 0, display: "flex", flexDirection: "column",
          background: "linear-gradient(160deg, #1e1e2c 0%, #17171e 100%)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, overflow: "hidden",
          boxShadow: "0 0 40px rgba(0,255,212,.03), 0 16px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.05)",
        }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>

            {/* Model selector */}
            <div style={{ position: "relative", marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                <div style={{ width: 2, height: 10, borderRadius: 1, background: "var(--teal)", flexShrink: 0 }} />
                <div style={{ fontSize: 9, fontWeight: 800, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".07em" }}>AI Model</div>
              </div>

              <button onClick={() => setModelOpen(v => !v)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                background: `${modelDef.color}10`, border: `1.5px solid ${modelDef.color}40`,
                borderRadius: 10, cursor: "pointer", textAlign: "left",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: modelDef.color }}>{modelDef.label}</span>
                    <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: `${modelDef.color}22`, color: modelDef.color }}>{modelDef.badge}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--faint)" }}>{modelDef.price} · {modelDef.outputLine1}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <Stars n={modelDef.stars} color={modelDef.color} />
                  {modelOpen ? <ChevronUp size={12} color="var(--faint)" /> : <ChevronDown size={12} color="var(--faint)" />}
                </div>
              </button>

              {modelOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
                  background: "#15151e", border: "1px solid var(--gb)", borderRadius: 12,
                  overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,.8)",
                }}>
                  {MODELS.map(m => {
                    const active = aiModel === m.id;
                    return (
                      <button key={m.id} onClick={() => {
                        setAiModel(m.id);
                        setSlots(prev => prev.map(s => ({ ...s, duration: m.durations.includes(s.duration) ? s.duration : m.durations[0] })));
                        setModelOpen(false);
                      }} style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px", cursor: "pointer", textAlign: "left",
                        background: active ? `${m.color}10` : "transparent",
                        borderBottom: "1px solid rgba(255,255,255,.04)",
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: active ? m.color : "var(--text)" }}>{m.label}</span>
                            <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: active ? `${m.color}25` : "rgba(255,255,255,.07)", color: active ? m.color : "var(--faint)", fontWeight: 800 }}>{m.badge}</span>
                          </div>
                          <div style={{ fontSize: 10, color: "var(--faint)" }}>{m.outputLine1}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: active ? m.color : "var(--dim)", marginBottom: 2 }}>{m.price}</div>
                          <Stars n={m.stars} color={m.color} />
                        </div>
                        {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Constraints */}
              <div style={{ marginTop: 10, padding: "8px 12px", background: `${modelDef.color}0e`, border: `1px solid ${modelDef.color}25`, borderRadius: 8, fontSize: 10.5, color: "var(--dim)", lineHeight: 1.9 }}>
                <b style={{ color: modelDef.color }}>{modelDef.label}</b>
                <div>ความยาว: <b>{modelDef.durations.map(d => `${d}s`).join(", ")}</b></div>
                {modelDef.promptLimit && <div>Prompt สูงสุด: <b>{modelDef.promptLimit.toLocaleString()} ตัวอักษร</b></div>}
                {modelDef.isAI && <div style={{ color: "var(--faint)" }}>ทุกคลิป: Gemini Vision → prompt ~120 คำ</div>}
              </div>
            </div>

            {/* Setup-phase controls */}
            {phase === "setup" && product && (
              <>
                <div style={{ height: 1, background: "rgba(255,255,255,.06)", margin: "14px 0" }} />

                {/* Audio */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>เสียงพากย์</div>
                  <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                    {([
                      { id: "ai", label: "🤖 AI" },
                      { id: "upload", label: "🎙️ Upload" },
                      { id: "none", label: "🔇 ไม่มี" },
                    ] as { id: "ai"|"upload"|"none"; label: string }[]).map(m => (
                      <button key={m.id} onClick={() => setAudioMode(m.id)} style={{
                        flex: 1, padding: "6px 4px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                        border: `1.5px solid ${audioMode === m.id ? "var(--teal)" : "var(--gb)"}`,
                        background: audioMode === m.id ? "rgba(0,255,212,.08)" : "transparent",
                        color: audioMode === m.id ? "var(--teal)" : "var(--faint)",
                        fontSize: 10.5, fontWeight: 700,
                      }}>{m.label}</button>
                    ))}
                  </div>
                  {audioMode === "ai" && (
                    <div style={{ display: "flex", gap: 5 }}>
                      {([
                        { id: "หญิง (ไทย)", label: "หญิง" },
                        { id: "ชาย (ไทย)", label: "ชาย" },
                        { id: "หญิง 2 (ไทย)", label: "หญิง 2" },
                      ] as { id: string; label: string }[]).map(v => (
                        <button key={v.id} onClick={() => setAiVoice(v.id)} style={{
                          flex: 1, padding: "5px 6px", borderRadius: 7, cursor: "pointer",
                          border: `1.5px solid ${aiVoice === v.id ? "var(--teal)" : "var(--gb)"}`,
                          background: aiVoice === v.id ? "rgba(0,255,212,.1)" : "transparent",
                          color: aiVoice === v.id ? "var(--teal)" : "var(--faint)",
                          fontSize: 10.5, fontWeight: 700,
                        }}>{v.label}</button>
                      ))}
                    </div>
                  )}
                  {audioMode === "upload" && (
                    <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 8, border: "1.5px dashed rgba(0,255,212,.35)", background: "rgba(0,255,212,.04)", cursor: "pointer", fontSize: 11 }}>
                      <input type="file" accept="audio/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadAudio(f); }} />
                      {uploadingAudio ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> กำลังอัพโหลด...</>
                        : uploadedAudioUrl ? <><span>✅</span><span style={{ color: "var(--ok)" }}>{uploadedFileName || "สำเร็จ"}</span></>
                        : <><span>📁</span><span style={{ color: "var(--teal)" }}>เลือกไฟล์เสียง</span></>}
                    </label>
                  )}
                </div>

                {/* Summary */}
                <div style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(0,0,0,.2)", border: "1px solid var(--gb)", borderRadius: 10, fontSize: 10.5, color: "var(--faint)", lineHeight: 2 }}>
                  <div>คลิป: <b style={{ color: "var(--dim)" }}>{slots.length} × {slots.map(s=>s.duration).join("/")}s = {totalDuration}s</b></div>
                  {modelDef.isAI && <div>ราคา: <b style={{ color: "#f87171" }}>${totalCost.toFixed(2)} (~{Math.round(totalCost * 35)} บาท)</b></div>}
                  <div>เสียง: <b style={{ color: audioMode === "ai" ? "var(--ok)" : "var(--dim)" }}>{audioMode === "ai" ? `TTS (${aiVoice})` : audioMode === "upload" ? "upload" : "ไม่มี"}</b></div>
                </div>

                {modelDef.isAI && totalCost > 5 && (
                  <div style={{ marginBottom: 10, padding: "8px 12px", background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.3)", borderRadius: 8, fontSize: 11, color: "#f87171", lineHeight: 1.6 }}>
                    ⚠️ {slots.length} คลิป × ${modelDef.pricePerClip} = <b>${totalCost.toFixed(2)}</b>
                  </div>
                )}

                <button
                  onClick={runRender}
                  disabled={audioMode === "upload" && !uploadedAudioUrl}
                  style={{
                    width: "100%", padding: "13px 16px", borderRadius: 12,
                    cursor: audioMode === "upload" && !uploadedAudioUrl ? "not-allowed" : "pointer",
                    opacity: audioMode === "upload" && !uploadedAudioUrl ? 0.45 : 1,
                    background: totalCost > 5 && modelDef.isAI ? "linear-gradient(90deg,#f87171,#ef4444)" : `linear-gradient(90deg,${modelDef.color},var(--blue))`,
                    border: "none", color: "#fff", fontSize: 13, fontWeight: 900,
                    boxShadow: totalCost > 5 && modelDef.isAI ? "0 4px 20px rgba(239,68,68,.4)" : `0 4px 20px ${modelDef.color}40`,
                  }}>
                  {!modelDef.isAI ? `สร้าง Ken Burns ${slots.length} คลิป (ฟรี)` : `สร้าง AI ${slots.length} คลิป →`}
                </button>

                {modelDef.isAI && slots.some(s => !s.prompt.trim()) && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--faint)" }}>
                    <Wand2 size={11} /> คลิปที่ว่าง Gemini เขียน prompt ให้
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT: phase content */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>

          {phase === "product_select" ? (
            <>
              <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>เลือก Asset</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
                {products.map(p => (
                  <button key={p.id} onClick={() => selectProduct(p)} style={{
                    padding: 0, borderRadius: 14, cursor: "pointer", textAlign: "left",
                    background: "linear-gradient(160deg, #1e1e2c, #181820)",
                    border: "1px solid rgba(255,255,255,.08)", overflow: "hidden",
                    boxShadow: "0 4px 20px rgba(0,0,0,.4)",
                  }}>
                    <div style={{ position: "relative" }}>
                      {p.media_urls?.[0]
                        ? <img src={imgProxy(p.media_urls[0])} alt="" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
                        : <div style={{ width: "100%", height: 140, background: "rgba(255,255,255,.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📦</div>
                      }
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, rgba(0,0,0,.7))" }} />
                    </div>
                    <div style={{ padding: "10px 14px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{p.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 3 }}>{p.media_urls?.length || 0} รูป</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : phase === "questions" && product ? (
            <div style={{ maxWidth: 520 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 14px", background: "rgba(0,255,212,.06)", border: "1px solid rgba(0,255,212,.2)", borderRadius: 12 }}>
                {product.media_urls?.[0] && <img src={imgProxy(product.media_urls[0])} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{product.name}</div>
                  <div style={{ fontSize: 11, color: "var(--faint)" }}>{product.media_urls.length} รูป</div>
                </div>
                <button onClick={() => { setProduct(null); setPhase("product_select"); }} style={{ fontSize: 11, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}>เปลี่ยน</button>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>1. อยากทำวิดีโอแบบไหน?</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {VIDEO_TYPES.map(vt => (
                    <button key={vt.id} onClick={() => setVideoType(vt.id)} style={{
                      padding: "12px 14px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                      border: `2px solid ${videoType === vt.id ? "var(--teal)" : "var(--gb)"}`,
                      background: videoType === vt.id ? "rgba(0,255,212,.08)" : "var(--glass)",
                    }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{vt.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: videoType === vt.id ? "var(--teal)" : "var(--text)" }}>{vt.id}</div>
                      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 2 }}>{vt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>2. เน้นอะไรเป็นพิเศษ? <span style={{ fontWeight: 400, color: "var(--faint)", fontSize: 11 }}>(ไม่บังคับ)</span></div>
                <input type="text" value={focusInput} onChange={e => setFocusInput(e.target.value)}
                  placeholder="เช่น สระน้ำ · ห้องนอน ocean view · outdoor dining"
                  style={{ width: "100%", background: "#1a1a22", border: "1px solid var(--gb)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>3. วิดีโอยาวแค่ไหน?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[15, 30, 60].map(d => (
                    <button key={d} onClick={() => setTargetDuration(d)} style={{
                      flex: 1, padding: "12px", borderRadius: 10, cursor: "pointer",
                      border: `2px solid ${targetDuration === d ? "var(--teal)" : "var(--gb)"}`,
                      background: targetDuration === d ? "rgba(0,255,212,.08)" : "var(--glass)",
                      color: targetDuration === d ? "var(--teal)" : "var(--faint)", fontSize: 14, fontWeight: 800,
                    }}>{d} วิ</button>
                  ))}
                </div>
              </div>
              <button onClick={generateAIStoryboard} style={{
                width: "100%", padding: "15px", borderRadius: 14, cursor: "pointer",
                background: "linear-gradient(90deg,var(--teal),var(--blue))",
                border: "none", color: "#06060A", fontSize: 15, fontWeight: 900,
                boxShadow: "0 6px 24px rgba(0,255,212,.3)",
              }}>
                <Wand2 size={16} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                Gemini วาง Storyboard ให้เลย →
              </button>
            </div>
          ) : product ? (
            <>
              {/* Product header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: "rgba(0,255,212,.06)", border: "1px solid rgba(0,255,212,.2)", borderRadius: 12 }}>
                {product.media_urls?.[0] && <img src={imgProxy(product.media_urls[0])} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{product.name}</div>
                  <div style={{ fontSize: 11, color: "var(--faint)" }}>{slots.length} คลิป · รวม {totalDuration} วิ · {product.media_urls.length} รูป</div>
                </div>
                <button onClick={() => { setProduct(null); setSlots([]); setSessionJobId(null); setPhase("product_select"); }} style={{ fontSize: 11, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}>เปลี่ยน</button>
              </div>

              {/* Clip slots */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                {slots.map((slot, i) => {
                  const imgUrl = product.media_urls[slot.imageIndex];
                  const ps = !modelDef.isAI ? null : getPromptStatus(slot.prompt);
                  const charCount = slot.prompt.length;
                  const charLimit = modelDef.promptLimit;
                  const charColor = !charLimit ? "var(--faint)" : charCount > 1900 ? "rgba(255,77,106,.9)" : charCount > 1500 ? "#f59e0b" : "var(--faint)";
                  return (
                    <div key={i} style={{ background: "var(--glass)", border: `1px solid ${ps ? ps.borderColor : "var(--gb)"}`, borderRadius: 14, overflow: "visible" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, padding: "12px 14px", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--teal)", background: "rgba(0,255,212,.1)", borderRadius: 6, padding: "2px 8px" }}>#{i + 1}</div>
                            {slots.length > 1 && (
                              <button onClick={() => removeSlot(i)} style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid rgba(255,77,106,.3)", background: "rgba(255,77,106,.06)", cursor: "pointer", color: "rgba(255,77,106,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                                <X size={9} />
                              </button>
                            )}
                          </div>
                          <div style={{ position: "relative" }}>
                            {imgUrl && <img src={imgProxy(imgUrl)} alt="" onClick={() => setImgPickerOpen(imgPickerOpen === i ? null : i)} style={{ width: 68, height: 120, objectFit: "cover", borderRadius: 8, cursor: product.media_urls.length > 1 ? "pointer" : "default", border: imgPickerOpen === i ? "2px solid var(--teal)" : "2px solid transparent" }} />}
                            {product.media_urls.length > 1 && <div onClick={() => setImgPickerOpen(imgPickerOpen === i ? null : i)} style={{ fontSize: 8, fontWeight: 700, textAlign: "center", color: "var(--faint)", cursor: "pointer", marginTop: 2 }}>{imgPickerOpen === i ? "✕ ปิด" : "เปลี่ยนรูป"}</div>}
                          </div>
                          {imgPickerOpen === i && product.media_urls.length > 1 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, width: 148, marginTop: 4, padding: 6, background: "rgba(0,0,0,.5)", borderRadius: 8, border: "1px solid var(--gb)" }}>
                              {product.media_urls.map((url, idx) => (
                                <img key={idx} src={imgProxy(url)} alt="" onClick={() => { updateSlot(i, { imageIndex: idx }); setImgPickerOpen(null); }} style={{ width: 40, height: 70, objectFit: "cover", borderRadius: 5, cursor: "pointer", border: `2px solid ${slot.imageIndex === idx ? "var(--teal)" : "transparent"}`, opacity: slot.imageIndex === idx ? 1 : 0.55 }} />
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                            <button onClick={() => moveSlot(i, -1)} disabled={i === 0} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid var(--gb)", background: "transparent", cursor: i === 0 ? "not-allowed" : "pointer", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronUp size={10} /></button>
                            <button onClick={() => moveSlot(i, 1)} disabled={i === slots.length - 1} style={{ width: 22, height: 22, borderRadius: 5, border: "1px solid var(--gb)", background: "transparent", cursor: i === slots.length - 1 ? "not-allowed" : "pointer", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronDown size={10} /></button>
                          </div>
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>Prompt #{i + 1}</div>
                            {ps && <span style={{ fontSize: 9, fontWeight: 800, color: ps.color, background: `${ps.color}18`, padding: "1px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>{ps.label}</span>}
                          </div>
                          <div style={{ position: "relative" }}>
                            <textarea value={slot.prompt} onChange={e => updateSlot(i, { prompt: e.target.value })}
                              placeholder={!modelDef.isAI ? "ไม่จำเป็น — Ken Burns ไม่ใช้ prompt" : "concept (ไทยหรือ English) — Gemini อ่านรูป + เขียน prompt ~120 คำ"}
                              rows={3} style={{ width: "100%", background: "#1a1a22", border: `1px solid ${ps ? ps.borderColor : "var(--gb)"}`, borderRadius: 10, padding: "8px 12px", paddingBottom: modelDef.isAI ? "22px" : "8px", color: "var(--text)", fontSize: 12, outline: "none", fontFamily: "monospace", resize: "none", lineHeight: 1.6, boxSizing: "border-box" }}
                            />
                            {modelDef.isAI && charLimit && <div style={{ position: "absolute", bottom: 5, right: 8, fontSize: 9, color: charColor, pointerEvents: "none", fontWeight: charCount > 1900 ? 800 : 400 }}>{charCount}/{charLimit}</div>}
                          </div>
                          {modelDef.isAI && (
                            <button onClick={() => suggestPrompt(i)} disabled={generating === i} style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "var(--blue)", background: "rgba(77,127,255,.08)", border: "1px solid rgba(77,127,255,.2)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
                              {generating === i ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={10} />}
                              Gemini อ่านรูป → เขียน prompt ใหม่
                            </button>
                          )}
                          {ps?.state === "good" && <div style={{ marginTop: 5, fontSize: 10, color: "#22D499", opacity: .7 }}>Gemini รักษา concept + เพิ่ม cinematic detail</div>}
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>Text บนจอ <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(ไม่บังคับ — 3 วิแรก)</span></div>
                            <input type="text" value={slot.label} onChange={e => updateSlot(i, { label: e.target.value })} placeholder="เช่น  ห้องนอน · Living Room" maxLength={35}
                              style={{ width: "100%", background: "#1a1a22", border: slot.label.trim() ? "1px solid rgba(0,255,212,.3)" : "1px solid var(--gb)", borderRadius: 8, padding: "6px 10px", color: "var(--text)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 66 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em" }}>ความยาว</div>
                          {modelDef.durations.map(d => (
                            <button key={d} onClick={() => updateSlot(i, { duration: d })} style={{ padding: "5px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, border: `1.5px solid ${slot.duration === d ? modelDef.color : "var(--gb)"}`, background: slot.duration === d ? `${modelDef.color}18` : "transparent", color: slot.duration === d ? modelDef.color : "var(--faint)" }}>{d}s</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={addSlot} style={{ width: "100%", padding: "10px", borderRadius: 12, cursor: "pointer", border: "1.5px dashed rgba(0,255,212,.3)", background: "rgba(0,255,212,.04)", color: "var(--teal)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Plus size={13} />
                เพิ่มคลิป ({slots.length} → {slots.length + 1}) · มีรูป {product.media_urls.length} รูป
              </button>
            </>
          ) : null}
        </div>

      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
