"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Send, Loader2, Sparkles, ArrowUp, X, Plus,
  RefreshCw, CheckCircle2, ChevronDown, ChevronUp,
} from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }

type Phase = "home" | "story" | "generating" | "prompt_edit" | "rendering" | "done" | "error";
type Mode  = "assets" | "script" | "audio" | "ads";
type AspectRatio = "9:16" | "1:1" | "16:9";
type AIModel = "kenburs" | "kling3s" | "seedance2" | "seedance2_pro";

interface ChatMsg {
  role: "user" | "ai" | "loading";
  text?: string;
  images?: string[];
  assets?: string[];
}

const QUESTIONS_ASSETS = [
  {
    id: "brand", type: "text" as const,
    getAi: (p: string) => `เข้าใจแล้ว — คุณอยากทำ${p} ฉันควรเรียนรู้เกี่ยวกับแบรนด์ของคุณอย่างไร?`,
    placeholder: "วาง URL เว็บแบรนด์ หรือพิมพ์ 'ใช้ Brand Profile ที่มีอยู่'",
    getAfter: (a: string) => a.startsWith("http")
      ? `รับทราบ — จะเรียนรู้จากเว็บนี้ คุณอยากให้วิดีโอยาวเท่าไหร่?`
      : `รับทราบ — จะใช้ Brand Profile ที่มีอยู่ คุณอยากให้วิดีโอยาวเท่าไหร่?`,
    loading: "✨ Learning about your brand...",
  },
  {
    id: "duration", type: "choices" as const,
    getAi: null,
    choices: ["30 วินาที", "60 วินาที", "90 วินาที", "Something else..."],
    getAfter: (a: string) => `รับทราบ — วิดีโอ ${a} สไตล์ที่อยากได้คือ?`,
  },
  {
    id: "style", type: "choices" as const,
    getAi: null,
    choices: ["🎨 Playful Overlay", "✨ Luxury Cinematic", "🎉 Party Vibes", "⬜ Minimal Clean"],
    getAfter: (a: string) => `เยี่ยม! เลือก ${a} Platform หลักที่จะโพสต์คือ?`,
  },
  {
    id: "platform", type: "choices" as const,
    getAi: null,
    choices: ["TikTok", "Instagram Reel", "Facebook", "YouTube Short"],
    getAfter: (a: string) => `รับทราบ — สร้างวิดีโอสำหรับ ${a} กำลังเตรียม script...`,
  },
];

const QUESTIONS_SCRIPT = [
  {
    id: "script_text", type: "text" as const,
    getAi: (p: string) => `โอเค — อยากทำ${p} พิมพ์ script ที่ต้องการได้เลยครับ`,
    placeholder: "พิมพ์ script ของคุณที่นี่...",
    getAfter: () => `ได้ script แล้ว — Platform ที่จะโพสต์คือ?`,
  },
  {
    id: "platform", type: "choices" as const,
    getAi: null,
    choices: ["TikTok", "Instagram Reel", "Facebook", "YouTube Short"],
    getAfter: (a: string) => `สร้างวิดีโอสำหรับ ${a} กำลังแปลง script เป็น voice...`,
  },
];

const QUESTIONS_ADS = [
  {
    id: "offer", type: "text" as const,
    getAi: (p: string) => `เข้าใจแล้ว — ${p} Offer พิเศษที่อยากโปรโมทคืออะไร?`,
    placeholder: "เช่น: ลด 20% เฉพาะสุดสัปดาห์นี้, ฟรีอาหารเช้า, จอง 2 คืนแถม 1",
    getAfter: (a: string) => `เยี่ยม — offer: ${a} Platform หลักคือ?`,
  },
  {
    id: "platform", type: "choices" as const,
    getAi: null,
    choices: ["TikTok", "Instagram Reel", "Facebook", "YouTube Short"],
    getAfter: (a: string) => `สร้าง Ad สำหรับ ${a} กำลังสร้าง...`,
  },
];

const MODE_TABS = [
  { id: "assets" as Mode,  label: "Assets to Video", icon: "🖼️" },
  { id: "script" as Mode,  label: "Script to Video", icon: "📝" },
  { id: "audio"  as Mode,  label: "Audio to Video",  icon: "🎵" },
  { id: "ads"    as Mode,  label: "Assets to Ads",   icon: "📢" },
];

const ASPECT_OPTIONS: AspectRatio[] = ["9:16", "1:1", "16:9"];
const MODEL_OPTIONS: { id: AIModel; label: string; desc: string; priceClip: string; price3clips: string; badge?: string; color: string }[] = [
  {
    id: "kenburs",
    label: "Ken Burns",
    desc: "รูปนิ่ง + zoom/pan — ไม่ใช้ AI",
    priceClip: "ฟรี",
    price3clips: "ฟรี",
    badge: "FREE",
    color: "#22D499",
  },
  {
    id: "kling3s",
    label: "Kling v3 Standard",
    desc: "AI motion จริง — คุณภาพสูง",
    priceClip: "$1.89 / คลิป",
    price3clips: "~$5.67 / วิดีโอ",
    badge: "ถูกสุด",
    color: "#00FFD4",
  },
  {
    id: "seedance2",
    label: "Seedance 2.0 Fast",
    desc: "AI ByteDance — motion ลื่น",
    priceClip: "$2.43 / คลิป",
    price3clips: "~$7.29 / วิดีโอ",
    color: "#4D7FFF",
  },
  {
    id: "seedance2_pro",
    label: "Seedance 2.0 Pro",
    desc: "คุณภาพสูงสุด — 4K",
    priceClip: "$4.25 / คลิป",
    price3clips: "~$12.75 / วิดีโอ",
    badge: "แพง",
    color: "#FF6B6B",
  },
];

const PLATFORM_MAP: Record<string, string> = {
  "tiktok": "tiktok", "instagram reel": "instagram", "instagram": "instagram",
  "facebook": "facebook", "youtube short": "youtube_shorts",
  "youtube shorts": "youtube_shorts", "youtube_short": "youtube_shorts",
};
const VOICE_FOR_STYLE: Record<string, string> = {
  luxury: "หนักแน่น (ชาย)", party: "สดใส (หญิง)",
  minimal: "มืออาชีพ (ชาย)", playful: "เป็นกันเอง (หญิง)",
};

function imgProxy(url: string) {
  if (!url) return url;
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return url.startsWith("/") ? `${base}/api/v1/files/${url.slice(1)}` : url;
}

export default function GeneratePage() {
  const router = useRouter();

  // ── core state ─────────────────────────────────────────────────────────────
  const [phase, setPhase]       = useState<Phase>("home");
  const [mode, setMode]         = useState<Mode>("assets");
  const [prompt, setPrompt]     = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct]   = useState<Product | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // badge state
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [aiModel, setAiModel]         = useState<AIModel>("kling3s");
  const [captions, setCaptions]       = useState(false);
  const [includeVoice, setIncludeVoice] = useState(true);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [showModelMenu, setShowModelMenu]   = useState(false);

  // story
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [qIndex, setQIndex]     = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [answers, setAnswers]   = useState<Record<string, string>>({});
  const [aiTyping, setAiTyping] = useState(false);
  const [brandLoading, setBrandLoading] = useState(false);

  // prompt review
  const [videoPrompt, setVideoPrompt]   = useState("");
  const [pendingJobId, setPendingJobId] = useState("");
  const [pendingVoiceUrl, setPendingVoiceUrl] = useState("");
  const [pendingDurSec, setPendingDurSec]     = useState(30);
  const [pendingStyle, setPendingStyle]       = useState("playful");

  const [elapsed, setElapsed]         = useState(0);
  const [errMsg, setErrMsg]           = useState("");
  const [renderVideoUrl, setRenderVideoUrl] = useState("");
  const [logoUrl, setLogoUrl]         = useState("");

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef   = useRef<HTMLDivElement>(null);
  const aspectRef   = useRef<HTMLDivElement>(null);
  const modelRef    = useRef<HTMLDivElement>(null);

  const questions = mode === "script" ? QUESTIONS_SCRIPT : mode === "ads" ? QUESTIONS_ADS : QUESTIONS_ASSETS;

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiTyping]);

  // close menus on outside click (mousedown avoids React synthetic event issues)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setShowPicker(false);
      if (!aspectRef.current?.contains(e.target as Node)) setShowAspectMenu(false);
      if (!modelRef.current?.contains(e.target as Node)) setShowModelMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const pushMsg = (msg: ChatMsg) => setMessages(prev => [...prev, msg]);

  const addAiTyping = async (text: string, delay = 600) => {
    setAiTyping(true);
    await sleep(delay);
    setAiTyping(false);
    pushMsg({ role: "ai", text });
  };

  // ── start story ────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!prompt.trim() && !product) return;
    const userPrompt = prompt.trim() || `สร้างวิดีโอสำหรับ ${product?.name}`;

    pushMsg({
      role: "user", text: userPrompt,
      images: product?.media_urls?.slice(0, 3),
      assets: product ? [`📦 ${product.name}`] : [],
    });
    setPhase("story");
    setPrompt("");
    setQIndex(0);

    const q0 = questions[0];
    await addAiTyping(q0.getAi?.(userPrompt) ?? "", 800);
  };

  // ── story answer ───────────────────────────────────────────────────────────
  const handleAnswer = async (answer: string) => {
    const q = questions[qIndex];
    const newAnswers = { ...answers, [q.id]: answer };
    setAnswers(newAnswers);
    pushMsg({ role: "user", text: answer });
    setChatInput("");

    const afterText = q.getAfter?.(answer) ?? "";

    if (q.id === "brand" && "loading" in q && q.loading) {
      await addAiTyping(afterText, 500);
      setBrandLoading(true);
      pushMsg({ role: "loading", text: q.loading as string });
      await sleep(2500);
      setBrandLoading(false);
      setMessages(prev => prev.filter(m => m.role !== "loading"));
    } else {
      await addAiTyping(afterText, 500);
    }

    const nextIndex = qIndex + 1;
    if (nextIndex < questions.length) {
      setQIndex(nextIndex);
    } else {
      await sleep(600);
      runGenerate(newAnswers);
    }
  };

  // ── generate: script + voice → suggest prompt ─────────────────────────────
  const runGenerate = async (ans: Record<string, string>) => {
    if (!product && mode !== "script") return;
    setPhase("generating");

    try {
      const durStr = ans.duration || "30 วินาที";
      const durSec = durStr.includes("60") ? 60 : durStr.includes("90") ? 90 : 30;
      const styleId = (ans.style || "").includes("Luxury") ? "luxury"
                    : (ans.style || "").includes("Party")  ? "party"
                    : (ans.style || "").includes("Minimal") ? "minimal"
                    : "playful";
      const platformRaw = (ans.platform || "").toLowerCase().trim();
      const platform = PLATFORM_MAP[platformRaw] ?? "tiktok";

      const jobRes = await api.post("/jobs/", { product_id: product!.id, platform });
      const jobId  = jobRes.data.id;

      try { await api.post(`/products/${product!.id}/analyze`); } catch { /* ok */ }

      if (mode === "script") {
        // user-supplied script — save directly (no AI generation)
        // use generate-script with concept carrying the full script
        await api.post(`/jobs/${jobId}/generate-script`, null, {
          params: { tone_of_voice: "ตามที่กำหนด", duration_sec: durSec, concept: ans.script_text || "" },
        });
      } else {
        const tone = styleId === "luxury" ? "หรู พรีเมียม ซีเนมาติก"
                   : styleId === "party"  ? "สนุก ปาร์ตี้ พลังงานสูง"
                   : styleId === "minimal" ? "สะอาด ตรงประเด็น"
                   : "playful สีสัน ลูกเล่น";
        const concept = mode === "ads"
          ? `Ad concept — offer: ${ans.offer || ""}`
          : (ans.brand?.startsWith("http") ? `แบรนด์: ${ans.brand}` : "");

        await api.post(`/jobs/${jobId}/generate-script`, null, {
          params: { tone_of_voice: tone, duration_sec: durSec, concept },
        });
      }

      let voiceoverUrl = "";
      if (includeVoice) {
        const voiceStyle = VOICE_FOR_STYLE[styleId] ?? "เป็นกันเอง (หญิง)";
        const voiceRes = await api.post(`/jobs/${jobId}/voiceover`, null, {
          params: { voice_style: voiceStyle },
        });
        voiceoverUrl = voiceRes.data.voiceover_url;
      }

      // suggest video prompt from AI
      let suggested = "";
      try {
        const suggestRes = await api.get(`/jobs/${jobId}/suggest-video-prompt`, {
          params: { style: styleId },
        });
        suggested = suggestRes.data.video_prompt || "";
      } catch { /* use style default */ }

      setPendingJobId(jobId);
      setPendingVoiceUrl(voiceoverUrl);
      setPendingDurSec(durSec);
      setPendingStyle(styleId);
      setVideoPrompt(suggested);
      setPhase("prompt_edit");

    } catch (e: unknown) {
      let msg = "เกิดข้อผิดพลาด";
      if (e && typeof e === "object") {
        const ax = e as { response?: { data?: { detail?: string }; status?: number }; message?: string };
        msg = ax.response?.data?.detail ? `[${ax.response.status}] ${ax.response.data.detail}` : ax.message || msg;
      }
      setErrMsg(msg);
      setPhase("error");
    }
  };

  // ── render with prompt ─────────────────────────────────────────────────────
  const runRender = async () => {
    setPhase("rendering");
    const start = Date.now();
    try {
      // POST returns 202 immediately — render runs in background
      await api.post(`/jobs/${pendingJobId}/render`, null, {
        params: {
          voiceover_url: pendingVoiceUrl,
          duration_sec:  pendingDurSec,
          style:         pendingStyle,
          video_prompt:  videoPrompt,
          ai_model:      aiModel,
          aspect_ratio:  aspectRatio.replace(/:/g, "x"),
          logo_url:      logoUrl,
        },
      });

      // Poll job status every 5s until completed or failed (max 10 min)
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const jobRes = await api.get(`/jobs/${pendingJobId}`);
        const status = jobRes.data.status as string;
        if (status === "failed") {
          throw new Error(jobRes.data.error_message || "Render failed on server");
        }
        if (status === "completed") {
          const rendersRes = await api.get(`/jobs/${pendingJobId}/renders`);
          const renders: Array<{ final_video_url?: string; status: string }> = rendersRes.data;
          const done = renders.find(r => r.status === "completed" && r.final_video_url);
          if (done?.final_video_url) {
            setRenderVideoUrl(imgProxy(done.final_video_url));
          }
          break;
        }
      }

      setElapsed(Math.round((Date.now() - start) / 1000));
      setPhase("done");
    } catch (e: unknown) {
      let msg = "เกิดข้อผิดพลาด";
      if (e && typeof e === "object") {
        const ax = e as { response?: { data?: { detail?: string }; status?: number }; message?: string };
        msg = ax.response?.data?.detail ? `[${ax.response.status}] ${ax.response.data.detail}` : ax.message || msg;
      }
      setErrMsg(msg);
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("home"); setMessages([]); setQIndex(0); setAnswers({});
    setChatInput(""); setErrMsg(""); setElapsed(0);
    setVideoPrompt(""); setPendingJobId(""); setPendingVoiceUrl("");
    setRenderVideoUrl(""); setLogoUrl("");
  };

  const currentQ = questions[qIndex];

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (phase === "home") return (
    <div style={{
      height: "100vh", background: "var(--bg)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "0 24px", overflow: "hidden",
    }}>

      <h1 style={{
        margin: "0 0 28px", fontSize: 34, fontWeight: 900, textAlign: "center", lineHeight: 1.2,
        color: "var(--text)", letterSpacing: "-.03em",
      }}>
        Create your{" "}
        <span style={{ background: "linear-gradient(90deg,var(--teal),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          story video
        </span>{" "}today
      </h1>

      {/* Main card */}
      <div style={{
        width: "100%", maxWidth: 700,
        background: "#1a1a22", border: "1px solid var(--gb)", borderRadius: 20,
        padding: "20px 20px 14px", boxShadow: "0 8px 40px rgba(0,0,0,.4)", marginBottom: 16,
      }}>

        {/* Asset picker row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>

          {/* Product picker */}
          <div ref={pickerRef} style={{ position: "relative" }}>
            <button
              onMouseDown={e => { e.stopPropagation(); setShowPicker(v => !v); setShowAspectMenu(false); setShowModelMenu(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: product ? "rgba(0,255,212,.1)" : "rgba(255,255,255,.06)",
                border: `1px solid ${product ? "rgba(0,255,212,.3)" : "var(--gb)"}`,
                borderRadius: 10, padding: "6px 12px", cursor: "pointer",
                fontSize: 12, fontWeight: 700,
                color: product ? "var(--teal)" : "var(--dim)",
              }}>
              <Plus size={13} />
              {product ? product.name : "เลือก Assets"}
              <ChevronDown size={11} />
            </button>
            {showPicker && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 99,
                background: "#1e1e2a", border: "1px solid var(--gb)",
                borderRadius: 12, overflow: "hidden", minWidth: 240, maxHeight: 220, overflowY: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,.7)",
              }}>
                {products.length === 0 ? (
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 8 }}>ยังไม่มีสินค้า</div>
                    <a href="/products" style={{
                      display: "inline-block", fontSize: 12, fontWeight: 700,
                      color: "var(--teal)", textDecoration: "none",
                      background: "rgba(0,255,212,.1)", border: "1px solid rgba(0,255,212,.2)",
                      borderRadius: 8, padding: "6px 12px",
                    }}>+ อัปโหลดสินค้าก่อน →</a>
                  </div>
                ) : products.map(p => (
                  <div key={p.id}
                    onMouseDown={() => { setProduct(p); setShowPicker(false); }}
                    style={{
                      padding: "10px 16px", cursor: "pointer", fontSize: 13,
                      background: product?.id === p.id ? "rgba(0,255,212,.08)" : "transparent",
                      color: product?.id === p.id ? "var(--teal)" : "var(--text)",
                      borderBottom: "1px solid var(--gb)",
                    }}>
                    📦 {p.name}
                    <span style={{ fontSize: 10, color: "var(--faint)", marginLeft: 6 }}>{p.media_urls?.length || 0} รูป</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Image thumbnails */}
          {product?.media_urls?.slice(0, 4).map((url, i) => (
            <div key={i} style={{ width: 38, height: 38, borderRadius: 8, overflow: "hidden", border: "1px solid var(--gb)", flexShrink: 0 }}>
              <img src={imgProxy(url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ))}
          {product && product.media_urls?.length > 4 && (
            <span style={{ fontSize: 11, color: "var(--faint)" }}>+{product.media_urls.length - 4} more</span>
          )}
        </div>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={
            mode === "script" ? "พิมพ์หัวข้อ/คอนเซ็ปต์ที่ต้องการ..."
            : mode === "ads"  ? "ทำ Ad โปรโมท pool villa พร้อม offer พิเศษ..."
            : "ทำเป็นรีวิวบ้านพลูวิลล่า แบบเชิญชวนมาพักผ่อน..."
          }
          rows={3}
          style={{
            width: "100%", background: "transparent", border: "none", outline: "none",
            color: "var(--text)", fontSize: 15, lineHeight: 1.7, resize: "none",
            fontFamily: "inherit", marginBottom: 14, boxSizing: "border-box",
          }}
        />

        {/* Badges + send row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

          {/* Voice toggle */}
          <button
            onMouseDown={() => setIncludeVoice(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
              borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: includeVoice ? "rgba(77,127,255,.12)" : "rgba(255,255,255,.06)",
              border: `1px solid ${includeVoice ? "rgba(77,127,255,.4)" : "var(--gb)"}`,
              color: includeVoice ? "#4D7FFF" : "var(--dim)",
            }}>
            🎙 เสียง {includeVoice ? "ON" : "OFF"}
          </button>

          {/* Caption toggle */}
          <button
            onMouseDown={() => setCaptions(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
              borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: captions ? "rgba(0,255,212,.12)" : "rgba(255,255,255,.06)",
              border: `1px solid ${captions ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
              color: captions ? "var(--teal)" : "var(--dim)",
            }}>
            🔠 Caption {captions ? "ON" : "OFF"}
          </button>

          {/* Aspect ratio */}
          <div ref={aspectRef} style={{ position: "relative" }}>
            <button
              onMouseDown={e => { e.stopPropagation(); setShowAspectMenu(v => !v); setShowModelMenu(false); setShowPicker(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
                borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: "rgba(255,255,255,.06)", border: "1px solid var(--gb)", color: "var(--dim)",
              }}>
              📐 {aspectRatio} {showAspectMenu ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showAspectMenu && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 99,
                background: "#1e1e2a", border: "1px solid var(--gb)",
                borderRadius: 10, overflow: "hidden", minWidth: 110,
                boxShadow: "0 6px 24px rgba(0,0,0,.7)",
              }}>
                {ASPECT_OPTIONS.map(ar => (
                  <div key={ar}
                    onMouseDown={() => { setAspectRatio(ar); setShowAspectMenu(false); }}
                    style={{
                      padding: "10px 16px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                      background: aspectRatio === ar ? "rgba(0,255,212,.1)" : "transparent",
                      color: aspectRatio === ar ? "var(--teal)" : "var(--text)",
                      borderBottom: "1px solid var(--gb)",
                    }}>
                    {ar === "9:16" ? "📱 9:16 (TikTok/IG)" : ar === "1:1" ? "⬜ 1:1 (Square)" : "🖥 16:9 (YouTube)"}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI model badge (compact, opens full picker below card) */}
          <button
            onMouseDown={() => setShowModelMenu(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
              borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: "rgba(255,255,255,.06)", border: "1px solid var(--gb)", color: "var(--dim)",
            }}>
            ✨ {MODEL_OPTIONS.find(m => m.id === aiModel)?.label}
            {showModelMenu ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>

          <div style={{ flex: 1 }} />

          <button
            onMouseDown={handleSend}
            disabled={!prompt.trim() && !product}
            style={{
              width: 42, height: 42, borderRadius: "50%",
              cursor: (prompt.trim() || product) ? "pointer" : "not-allowed",
              background: (prompt.trim() || product) ? "#fff" : "rgba(255,255,255,.12)",
              border: "none", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background .15s", flexShrink: 0,
            }}>
            <ArrowUp size={18} color={(prompt.trim() || product) ? "#000" : "#555"} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Model cards — always visible */}
      <div style={{ width: "100%", maxWidth: 700, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
          เลือก AI Model
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {MODEL_OPTIONS.map(m => {
            const active = aiModel === m.id;
            return (
              <button key={m.id} onMouseDown={() => setAiModel(m.id)} style={{
                padding: "12px 14px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                background: active ? `${m.color}14` : "rgba(255,255,255,.04)",
                border: `1.5px solid ${active ? m.color : "var(--gb)"}`,
                transition: "all .15s", position: "relative", overflow: "hidden",
              }}>
                {/* badge */}
                {m.badge && (
                  <span style={{
                    position: "absolute", top: 8, right: 8,
                    fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                    background: active ? m.color + "33" : "rgba(255,255,255,.08)",
                    color: active ? m.color : "var(--faint)",
                  }}>{m.badge}</span>
                )}
                <div style={{ fontSize: 12, fontWeight: 800, color: active ? m.color : "var(--text)", marginBottom: 3 }}>
                  {active ? "✓ " : ""}{m.label}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 6, lineHeight: 1.4 }}>{m.desc}</div>
                <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 2 }}>{m.priceClip}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: active ? m.color : "var(--dim)" }}>{m.price3clips}</div>
                <div style={{ fontSize: 9.5, color: "var(--faint)" }}>3 คลิป (30 วิ)</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 20 }}>
        {MODE_TABS.map(t => (
          <button key={t.id} onMouseDown={() => setMode(t.id)} style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 18px", borderRadius: 10, cursor: "pointer",
            background: mode === t.id ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)",
            border: `1px solid ${mode === t.id ? "rgba(255,255,255,.2)" : "var(--gb)"}`,
            color: mode === t.id ? "var(--text)" : "var(--faint)",
            fontSize: 13, fontWeight: 600, transition: "all .15s",
          }}>
            <span>{t.icon}</span>{t.label}
            {t.id === "audio" && <span style={{ fontSize: 9, background: "rgba(255,180,0,.15)", color: "#ffb400", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>SOON</span>}
          </button>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 13, color: "var(--faint)" }}>
        ✨ Get inspired. Then make it yours.
      </p>
    </div>
  );

  // ── STORY ─────────────────────────────────────────────────────────────────
  if (phase === "story") return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: "1px solid var(--gb)", flexShrink: 0 }}>
        <button onClick={reset} style={{ fontSize: 13, fontWeight: 700, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--faint)" }}>{qIndex + 1} / {questions.length}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 0" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>

          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 20 }}>
              {msg.role === "user" && (
                <div style={{ maxWidth: "75%" }}>
                  {msg.assets && msg.assets.length > 0 && (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginBottom: 6, flexWrap: "wrap" }}>
                      {msg.assets.map((a, j) => (
                        <span key={j} style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 10px", background: "rgba(255,255,255,.08)", border: "1px solid var(--gb)", borderRadius: 20, color: "var(--dim)" }}>{a}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ background: "#2a2a35", border: "1px solid var(--gb)", borderRadius: "18px 18px 4px 18px", padding: "12px 16px", fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>
                    {msg.text}
                  </div>
                  {msg.images && msg.images.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                      {msg.images.map((url, j) => (
                        <div key={j} style={{ width: 60, height: 60, borderRadius: 10, overflow: "hidden", border: "1px solid var(--gb)" }}>
                          <img src={imgProxy(url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {msg.role === "ai" && (
                <div style={{ maxWidth: "80%", fontSize: 14, color: "var(--text)", lineHeight: 1.8 }}>{msg.text}</div>
              )}
              {msg.role === "loading" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--faint)", fontStyle: "italic" }}>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  {msg.text}
                </div>
              )}
            </div>
          ))}

          {aiTyping && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--faint)", animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          )}

          {!aiTyping && !brandLoading && currentQ?.type === "choices" && (
            <div style={{ marginTop: 8, marginBottom: 20 }}>
              {currentQ.choices!.map((choice, i) => (
                <button key={choice} onClick={() => handleAnswer(choice)} style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "14px 18px", borderRadius: 12, cursor: "pointer",
                  background: "#1e1e28", border: "1px solid var(--gb)",
                  color: "var(--text)", fontSize: 14, fontWeight: 600,
                  marginBottom: 8, textAlign: "left", transition: "all .12s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#2a2a38")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#1e1e28")}
                >
                  <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: "rgba(255,255,255,.08)", border: "1px solid var(--gb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "var(--dim)" }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {choice}
                </button>
              ))}
            </div>
          )}

          {!aiTyping && !brandLoading && currentQ?.type === "text" && (
            <form onSubmit={e => { e.preventDefault(); if (chatInput.trim()) handleAnswer(chatInput.trim()); }}
              style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "flex-end" }}>
              {currentQ.id === "script_text" ? (
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder={currentQ.placeholder}
                  rows={4}
                  style={{
                    flex: 1, background: "#1e1e28", border: "1px solid var(--gb)",
                    borderRadius: 12, padding: "12px 16px", color: "var(--text)",
                    fontSize: 14, outline: "none", fontFamily: "inherit", resize: "vertical",
                  }}
                />
              ) : (
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder={currentQ.placeholder}
                  style={{
                    flex: 1, background: "#1e1e28", border: "1px solid var(--gb)",
                    borderRadius: 12, padding: "12px 16px", color: "var(--text)",
                    fontSize: 14, outline: "none", fontFamily: "inherit",
                  }}
                />
              )}
              <button type="submit" disabled={!chatInput.trim()} style={{
                width: 42, height: 42, borderRadius: 10, cursor: chatInput.trim() ? "pointer" : "not-allowed",
                background: chatInput.trim() ? "#fff" : "rgba(255,255,255,.1)",
                border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Send size={16} color={chatInput.trim() ? "#000" : "#555"} />
              </button>
            </form>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
      `}</style>
    </div>
  );

  // ── GENERATING ────────────────────────────────────────────────────────────
  if (phase === "generating") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", gap: 20 }}>
      <div style={{ position: "relative", width: 80, height: 80 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(0,255,212,.15)" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "var(--teal)", animation: "spin 1s linear infinite" }} />
        <Sparkles size={28} color="var(--teal)" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>กำลังสร้าง Script + Voice...</div>
        <div style={{ fontSize: 13, color: "var(--faint)" }}>AI กำลังเขียน script และสร้างเสียงให้</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {["Script", "Voice", "Prompt"].map(s => (
          <div key={s} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.2)", color: "var(--teal)" }}>{s}</div>
        ))}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── PROMPT EDIT ───────────────────────────────────────────────────────────
  if (phase === "prompt_edit") {
    const wordCount = videoPrompt.trim().split(/\s+/).filter(Boolean).length;
    const modelLabel = MODEL_OPTIONS.find(m => m.id === aiModel)?.label ?? aiModel;
    const regenPrompt = async () => {
      try {
        const r = await api.get(`/jobs/${pendingJobId}/suggest-video-prompt`, { params: { style: pendingStyle } });
        setVideoPrompt(r.data.video_prompt || "");
      } catch { /* keep existing */ }
    };
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: "40px 24px", gap: 16 }}>
        <div style={{ width: "100%", maxWidth: 620 }}>

          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--teal)" }}>
              Director&apos;s Brief
            </p>
            <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 900, color: "var(--text)" }}>
              AI อ่าน script แล้วเขียน prompt ให้
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--faint)", lineHeight: 1.6 }}>
              นี่คือ <b style={{ color: "var(--dim)" }}>คำสั่งกล้อง</b> ที่จะส่งให้ {modelLabel} สร้างคลิป
              — แก้ได้เลย หรือกด สร้างใหม่ ถ้าไม่ถูกใจ
            </p>
          </div>

          {/* Explainer box */}
          <div style={{ background: "rgba(0,255,212,.05)", border: "1px solid rgba(0,255,212,.15)", borderRadius: 12, padding: "12px 16px", marginBottom: 14, fontSize: 12, color: "var(--faint)", lineHeight: 1.7 }}>
            <b style={{ color: "var(--teal)", display: "block", marginBottom: 4 }}>ทำไมคลิปถึงออกมาแบบนี้?</b>
            AI อ่าน script ของคุณ → ดึง visual moment ที่แรงที่สุด → แปลงเป็นคำสั่งกล้อง (shot type, lighting, motion, color grade)
            ส่งตรงไป {modelLabel} — ผลลัพธ์ขึ้นอยู่กับ prompt นี้ 100%
          </div>

          {/* Prompt textarea */}
          <div style={{ position: "relative" }}>
            <textarea
              value={videoPrompt}
              onChange={e => setVideoPrompt(e.target.value)}
              rows={6}
              style={{
                width: "100%", background: "#1a1a22",
                border: "1px solid rgba(0,255,212,.25)",
                borderRadius: 14, padding: "16px", color: "var(--text)",
                fontSize: 13.5, outline: "none", fontFamily: "monospace", resize: "vertical",
                lineHeight: 1.8, boxSizing: "border-box",
              }}
            />
            <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 10, color: wordCount > 70 ? "#f87171" : "var(--faint)", fontWeight: 700 }}>
              {wordCount}/70 words
            </div>
          </div>

          {/* Tips */}
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--faint)", lineHeight: 1.8 }}>
            <b style={{ color: "var(--dim)" }}>Tips:</b>{" "}
            ใส่ shot type (Crane shot / Aerial drone / Low-angle push-in) ·
            ใส่ lighting (golden hour / neon uplighting) ·
            ใส่ motion (slow-motion water ripple) ·
            English เท่านั้น
          </div>

          {/* Regenerate */}
          <button onClick={regenPrompt} style={{
            marginTop: 10, display: "flex", alignItems: "center", gap: 6,
            background: "rgba(77,127,255,.1)", border: "1px solid rgba(77,127,255,.25)",
            borderRadius: 10, padding: "8px 14px", cursor: "pointer",
            color: "var(--blue)", fontSize: 12, fontWeight: 700,
          }}>
            <RefreshCw size={13} /> AI เขียนใหม่
          </button>

          {/* Settings row */}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {[
              { label: "Model", value: modelLabel, color: "var(--teal)" },
              { label: "Ratio", value: aspectRatio, color: "var(--teal)" },
              { label: "Duration", value: `${pendingDurSec}s`, color: "var(--teal)" },
              { label: "Style", value: pendingStyle, color: "var(--teal)" },
              { label: "Voice", value: includeVoice ? "ON" : "OFF", color: includeVoice ? "var(--ok)" : "var(--faint)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)", borderRadius: 8, padding: "5px 10px", fontSize: 11 }}>
                <span style={{ color: "var(--faint)" }}>{label}: </span>
                <b style={{ color }}>{value}</b>
              </div>
            ))}
          </div>

          {/* Logo URL */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 6, fontWeight: 700 }}>
              🏷 โลโก้ overlay (ไม่บังคับ) — PNG โปร่งใส
            </div>
            <input
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://... หรือ /assets/logos/logo.png"
              style={{
                width: "100%", background: "#1a1a22", border: "1px solid var(--gb)",
                borderRadius: 10, padding: "10px 14px", color: "var(--text)",
                fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={runRender} style={{
              flex: 1, padding: "15px 20px", borderRadius: 14, cursor: "pointer",
              background: "linear-gradient(90deg,var(--teal),var(--blue))",
              border: "none", color: "#06060A", fontSize: 15, fontWeight: 900,
              boxShadow: "0 6px 24px rgba(0,255,212,.3)",
            }}>
              สร้างวิดีโอ →
            </button>
            <button onClick={reset} style={{
              padding: "15px 16px", borderRadius: 14, cursor: "pointer",
              background: "rgba(255,255,255,.05)", border: "1px solid var(--gb)",
              color: "var(--faint)", fontSize: 13, fontWeight: 700,
            }}>
              <X size={14} />
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ── RENDERING ─────────────────────────────────────────────────────────────
  if (phase === "rendering") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", gap: 20 }}>
      <div style={{ position: "relative", width: 80, height: 80 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(77,127,255,.15)" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "var(--blue)", animation: "spin 1s linear infinite" }} />
        <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 24 }}>🎬</span>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
          {aiModel === "kenburs" ? "กำลัง Render วิดีโอ..." : `${MODEL_OPTIONS.find(m => m.id === aiModel)?.label ?? aiModel} กำลังสร้างวิดีโอ...`}
        </div>
        <div style={{ fontSize: 13, color: "var(--faint)" }}>
          {aiModel === "kenburs" ? "ใช้ Ken Burns effect — เร็วมาก" : "AI สร้าง motion จากรูปจริง — รอ 1–3 นาที"}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── DONE ──────────────────────────────────────────────────────────────────
  if (phase === "done") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", gap: 20, padding: 40 }}>
      <div style={{ position: "relative", width: 100, height: 100 }}>
        <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "conic-gradient(var(--teal),var(--blue),var(--teal))", animation: "spin 3s linear infinite", opacity: .6 }} />
        <div style={{ position: "absolute", inset: -3, borderRadius: "50%", background: "var(--bg)" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={44} color="var(--ok)" strokeWidth={1.5} />
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, background: "linear-gradient(90deg,var(--teal),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>สร้างสำเร็จ!</h2>
        <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--dim)" }}>{product?.name} · {answers.style || mode} · {answers.platform}</p>
        {elapsed > 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--faint)" }}>ใช้เวลา {elapsed >= 60 ? `${Math.floor(elapsed / 60)} นาที ${elapsed % 60} วิ` : `${elapsed} วินาที`}</p>}
      </div>
      {renderVideoUrl && (
        <video
          src={renderVideoUrl}
          controls
          autoPlay
          loop
          playsInline
          style={{ width: "100%", maxWidth: 340, borderRadius: 16, border: "1px solid var(--gb)" }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 340 }}>
        <button onClick={() => router.push("/preview")} style={{
          padding: "14px 20px", borderRadius: 14, cursor: "pointer",
          background: "linear-gradient(90deg,var(--teal),var(--blue))",
          border: "none", color: "#06060A", fontSize: 15, fontWeight: 900,
          boxShadow: "0 6px 24px rgba(0,255,212,.3)",
        }}>ดูวิดีโอใน Preview →</button>
        <button onClick={reset} style={{
          padding: "12px 20px", borderRadius: 14, cursor: "pointer",
          background: "rgba(255,255,255,.05)", border: "1px solid var(--gb)",
          color: "var(--faint)", fontSize: 13, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}><RefreshCw size={13} /> สร้างวิดีโอใหม่</button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── ERROR ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ fontSize: 36 }}>⚠️</div>
      <div style={{ fontSize: 14, color: "var(--err)", maxWidth: 320, textAlign: "center" }}>{errMsg}</div>
      <button onClick={reset} style={{ padding: "10px 24px", borderRadius: 10, cursor: "pointer", background: "rgba(255,77,106,.1)", border: "1px solid rgba(255,77,106,.2)", color: "var(--err)", fontSize: 13, fontWeight: 700 }}>
        <X size={13} style={{ marginRight: 6 }} />ลองใหม่
      </button>
    </div>
  );
}
