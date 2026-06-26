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
type AIModel = "kenburs" | "hailuo2pro" | "wan21" | "kling3s" | "kling3s_pro" | "seedance2" | "seedance2_pro";

interface ChatMsg {
  role: "user" | "ai" | "loading";
  text?: string;
  images?: string[];
  assets?: string[];
}

const QUESTIONS_ASSETS = [
  {
    id: "visual", type: "text" as const,
    getAi: (p: string) => `รับทราบ — อยากทำ "${p}" \n\nอยากให้คลิปแสดงภาพอะไรเป็นพิเศษ?\nเช่น: สระ infinity ตอนพระอาทิตย์ตก · ห้องนอน ocean view · outdoor dining กลางคืน · คู่รักในสระน้ำ`,
    placeholder: "บอก visual ที่อยากเห็นในคลิป เช่น: สระน้ำตอนเย็น วิวทะเล บรรยากาศโรแมนติก...",
    getAfter: (a: string) => `โอเค! จะใช้ภาพ "${a}" เป็น visual หลัก — วิดีโอจะยาวแค่ไหน?`,
    loading: "กำลังประมวลผล...",
  },
  {
    id: "duration", type: "choices" as const,
    getAi: null,
    choices: ["5 วิ", "10 วิ", "15 วิ", "20 วิ", "25 วิ", "30 วิ", "60 วิ", "90 วิ"],
    getAfter: (a: string) => `ได้เลย — วิดีโอ ${a} สไตล์ที่อยากได้คือ?`,
  },
  {
    id: "style", type: "choices" as const,
    getAi: null,
    choices: ["🎨 Playful สีสัน", "✨ Luxury หรูหรา", "🎉 Party สนุก", "⬜ Minimal เรียบ"],
    getAfter: (a: string) => `เยี่ยม! สไตล์ ${a} — จะโพสต์ที่ platform ไหน?`,
  },
  {
    id: "platform", type: "choices" as const,
    getAi: null,
    choices: ["TikTok", "Instagram Reel", "Facebook", "YouTube Short"],
    getAfter: (a: string) => `โอเค — สร้างวิดีโอสำหรับ ${a} กำลังเตรียม script...`,
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
  {
    id: "hailuo2pro",
    label: "Hailuo 2.3 Pro",
    desc: "Minimax — motion ลื่น atmospheric",
    priceClip: "$0.49 / คลิป",
    price3clips: "~$1.47 / วิดีโอ",
    badge: "ถูก",
    color: "#A78BFA",
  },
  {
    id: "wan21",
    label: "Wan 2.1",
    desc: "Alibaba — เข้าใจ prompt ดี ราคาประหยัด",
    priceClip: "$0.30 / คลิป",
    price3clips: "~$0.90 / วิดีโอ",
    badge: "ถูกสุด",
    color: "#34D399",
  },
  {
    id: "kling3s_pro",
    label: "Kling v3 Pro",
    desc: "Kuaishou — คุณภาพสูงสุด ระดับภาพยนตร์",
    priceClip: "$2.88 / คลิป",
    price3clips: "~$8.64 / วิดีโอ",
    badge: "Pro",
    color: "#818CF8",
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
  const [aiModel, setAiModel]         = useState<AIModel>("hailuo2pro");
  const [captions, setCaptions]       = useState(false);
  const [includeVoice, setIncludeVoice] = useState(true);
  const [clipCount, setClipCount]     = useState(1);
  // combined preset: sets both duration + clip count together
  const [videoPreset, setVideoPreset] = useState<"short"|"medium"|"long">("short");
  const [quickDuration, setQuickDuration] = useState(15);
  const [quickStyle, setQuickStyle]       = useState("✨ Luxury หรูหรา");
  const [quickTone, setQuickTone]         = useState("หรู พรีเมียม ซีเนมาติก");
  const [quickVoice, setQuickVoice]       = useState("หญิง (ไทย)");
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

  // billing
  const [falBalance, setFalBalance]   = useState<number | null>(null);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [falPricing, setFalPricing]   = useState<Record<string, {
    usd_per_clip: number; thb_per_clip: number;
    usd_per_video: number; thb_per_video: number; label: string;
  }>>({});

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef   = useRef<HTMLDivElement>(null);
  const modelRef    = useRef<HTMLDivElement>(null);

  const questions = mode === "script" ? QUESTIONS_SCRIPT : mode === "ads" ? QUESTIONS_ADS : QUESTIONS_ASSETS;

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (phase === "prompt_edit") {
      setBalanceLoaded(false);
      api.get("/billing/fal-balance").then(r => {
        if (r.data.balance_usd != null) setFalBalance(r.data.balance_usd);
        if (r.data.pricing) setFalPricing(r.data.pricing);
      }).catch(() => {}).finally(() => setBalanceLoaded(true));
    }
  }, [phase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiTyping]);

  // close menus on outside click (mousedown avoids React synthetic event issues)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setShowPicker(false);
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
    if (mode === "assets" && !product) {
      setErrMsg("กรุณาเลือก Asset (รูปภาพสินค้า) ก่อนกด Generate");
      setPhase("error");
      return;
    }
    if (!prompt.trim() && !product) return;
    const userPrompt = prompt.trim() || `สร้างวิดีโอสำหรับ ${product?.name}`;
    setPrompt("");

    // Fast path: prompt typed + product selected → skip all Q&A, generate directly
    if (prompt.trim() && mode === "assets" && product) {
      const autoAnswers = {
        visual: userPrompt,
        duration: `${quickDuration} วิ`,
        style: "✨ Luxury หรูหรา",
        platform: "TikTok",
      };
      setAnswers(autoAnswers);
      runGenerate(autoAnswers);
      return;
    }

    // Story path: no prompt typed, or non-assets mode → Q&A flow
    pushMsg({
      role: "user", text: userPrompt,
      images: product?.media_urls?.slice(0, 3),
      assets: product ? [`📦 ${product.name}`] : [],
    });
    setPhase("story");
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
    if (!product && mode !== "script") {
      setErrMsg("ไม่พบ Asset — กรุณากลับไปเลือกรูปภาพสินค้าก่อน");
      setPhase("error");
      return;
    }
    setPhase("generating");

    try {
      const durStr = ans.duration || "30";
      const durSec = parseInt((durStr.match(/\d+/) || ["30"])[0], 10) || 30;
      const styleId = (ans.style || "").toLowerCase().includes("luxury") || (ans.style || "").includes("หรู") ? "luxury"
                    : (ans.style || "").toLowerCase().includes("party") || (ans.style || "").includes("สนุก") ? "party"
                    : (ans.style || "").toLowerCase().includes("minimal") || (ans.style || "").includes("เรียบ") ? "minimal"
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
        const tone = quickTone || (styleId === "luxury" ? "หรู พรีเมียม ซีเนมาติก" : "playful สีสัน ลูกเล่น");
        const visualConcept = mode === "ads"
          ? `Ad promotion: ${ans.offer || ""}`
          : (ans.visual || "");

        await api.post(`/jobs/${jobId}/generate-script`, null, {
          params: { tone_of_voice: tone, duration_sec: durSec, concept: visualConcept },
        });
      }

      let voiceoverUrl = "";
      if (includeVoice) {
        const voiceStyle = quickVoice || VOICE_FOR_STYLE[styleId] || "หญิง (ไทย)";
        const voiceRes = await api.post(`/jobs/${jobId}/voiceover`, null, {
          params: { voice_style: voiceStyle },
        });
        voiceoverUrl = voiceRes.data.voiceover_url;
      }

      // suggest video prompt from AI — pass image_url so Gemini Vision can read the actual image
      let suggested = "";
      try {
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const firstImg = product?.media_urls?.[0];
        const imgUrl = firstImg?.startsWith("/")
          ? `${base}/api/v1/files/${firstImg.slice(1)}`
          : firstImg || "";
        const suggestRes = await api.get(`/jobs/${jobId}/suggest-video-prompt`, {
          params: {
            style: styleId,
            concept: ans.visual || "",
            image_url: imgUrl,
            ai_model: aiModel,
          },
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
          clip_count:    clipCount,
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
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "32px 24px", overflowY: "auto",
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
              onMouseDown={e => { e.stopPropagation(); setShowPicker(v => !v); setShowModelMenu(false); }}
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

        {/* Quick options — 2 clean rows */}
        {mode === "assets" && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 10, marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>

            {/* Row 1: ความยาว + โทน */}
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, color: "var(--faint)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", minWidth: 52, flexShrink: 0 }}>ความยาว</span>
              {([
                { id: "short" as const,  label: "สั้น", sub: "~15s", clips: 1, dur: 15 },
                { id: "medium" as const, label: "กลาง", sub: "~30s", clips: 2, dur: 30 },
                { id: "long" as const,   label: "ยาว",  sub: "~60s", clips: 3, dur: 60 },
              ] as { id: "short"|"medium"|"long"; label: string; sub: string; clips: number; dur: number }[]).map(p => (
                <button key={p.id} onMouseDown={() => { setVideoPreset(p.id); setClipCount(p.clips); setQuickDuration(p.dur); }} style={{
                  padding: "4px 10px", borderRadius: 7, cursor: "pointer", textAlign: "center",
                  background: videoPreset === p.id ? "rgba(0,255,212,.1)" : "rgba(255,255,255,.04)",
                  border: `1px solid ${videoPreset === p.id ? "rgba(0,255,212,.35)" : "var(--gb)"}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: videoPreset === p.id ? "var(--teal)" : "var(--dim)" }}>{p.label}</div>
                  <div style={{ fontSize: 9, color: "var(--faint)" }}>{p.sub}</div>
                </button>
              ))}
              <div style={{ width: 1, height: 24, background: "var(--gb)", margin: "0 2px", flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: "var(--faint)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0 }}>โทน</span>
              <select value={quickTone} onChange={e => setQuickTone(e.target.value)} style={{
                background: "#1b1c2a", border: "1px solid rgba(34,212,153,.35)",
                borderRadius: 8, padding: "5px 8px", color: "#22D499",
                fontSize: 11.5, fontWeight: 700, outline: "none", cursor: "pointer",
              }}>
                <option value="หรู พรีเมียม ซีเนมาติก">🎬 Cinematic</option>
                <option value="ผ่อนคลาย พักผ่อน ชวนมาเที่ยว">🏖️ Vacation</option>
                <option value="สนุก มีชีวิตชีวา เชิญชวน">🎉 Lively</option>
                <option value="มืออาชีพ กระชับ ข้อมูลครบ">💼 Pro</option>
                <option value="อบอุ่น เป็นกันเอง เชิญชวน">😊 Warm</option>
                <option value="เล่าเรื่อง อารมณ์ ความรู้สึก">📖 Story</option>
              </select>
            </div>

            {/* Row 2: เสียง + หน้าจอ */}
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, color: "var(--faint)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", minWidth: 52, flexShrink: 0 }}>เสียง</span>
              {includeVoice ? (
                <select value={quickVoice} onChange={e => setQuickVoice(e.target.value)} style={{
                  background: "#1b1c2a", border: "1px solid rgba(77,127,255,.35)",
                  borderRadius: 8, padding: "5px 8px", color: "#4D7FFF",
                  fontSize: 11.5, fontWeight: 700, outline: "none", cursor: "pointer",
                }}>
                  <option value="หญิง (ไทย)">👩 หญิง 1</option>
                  <option value="หญิง 2 (ไทย)">👩 หญิง 2</option>
                  <option value="ชาย (ไทย)">👨 ชาย</option>
                </select>
              ) : (
                <span style={{ fontSize: 11, color: "var(--faint)", fontStyle: "italic" }}>ปิดอยู่</span>
              )}
              <div style={{ width: 1, height: 24, background: "var(--gb)", margin: "0 2px", flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: "var(--faint)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0 }}>หน้าจอ</span>
              {([
                { ar: "9:16" as AspectRatio, label: "📱 9:16", sub: "TikTok" },
                { ar: "1:1"  as AspectRatio, label: "⬜ 1:1",  sub: "Square" },
                { ar: "16:9" as AspectRatio, label: "🖥 16:9", sub: "YouTube" },
              ] as { ar: AspectRatio; label: string; sub: string }[]).map(o => (
                <button key={o.ar} onMouseDown={() => setAspectRatio(o.ar)} style={{
                  padding: "4px 10px", borderRadius: 7, cursor: "pointer", textAlign: "center",
                  background: aspectRatio === o.ar ? "rgba(251,191,36,.1)" : "rgba(255,255,255,.04)",
                  border: `1px solid ${aspectRatio === o.ar ? "rgba(251,191,36,.4)" : "var(--gb)"}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: aspectRatio === o.ar ? "#FBBF24" : "var(--dim)" }}>{o.label}</div>
                  <div style={{ fontSize: 9, color: "var(--faint)" }}>{o.sub}</div>
                </button>
              ))}
            </div>

          </div>
        )}

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

          {/* AI model dropdown */}
          <div ref={modelRef} style={{ position: "relative" }}>
            <button
              onMouseDown={() => setShowModelMenu(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: showModelMenu ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.05)",
                border: `1px solid ${showModelMenu ? "rgba(255,255,255,.2)" : "var(--gb)"}`,
                color: MODEL_OPTIONS.find(m => m.id === aiModel)?.color || "var(--dim)",
              }}>
              ✨ {MODEL_OPTIONS.find(m => m.id === aiModel)?.label}
              <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 400 }}>
                {MODEL_OPTIONS.find(m => m.id === aiModel)?.priceClip}
              </span>
              {showModelMenu ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>

            {showModelMenu && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 200,
                background: "#16161f", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12,
                overflow: "hidden", minWidth: 300,
                boxShadow: "0 -12px 40px rgba(0,0,0,.7)",
              }}>
                {MODEL_OPTIONS.map(m => {
                  const active = aiModel === m.id;
                  return (
                    <button key={m.id} onMouseDown={() => { setAiModel(m.id); setShowModelMenu(false); }} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", cursor: "pointer", textAlign: "left",
                      background: active ? `${m.color}12` : "transparent",
                      borderBottom: "1px solid rgba(255,255,255,.04)",
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: active ? m.color : "var(--text)" }}>
                            {active && "✓ "}{m.label}
                          </span>
                          {m.badge && <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: active ? `${m.color}22` : "rgba(255,255,255,.07)", color: active ? m.color : "var(--faint)" }}>{m.badge}</span>}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--faint)" }}>{m.desc}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: active ? m.color : "var(--dim)" }}>{m.priceClip}</div>
                        <div style={{ fontSize: 9.5, color: "var(--faint)" }}>{m.price3clips}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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

      {/* Mode tabs — pill group */}
      <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)", borderRadius: 13, padding: 3, marginBottom: 20 }}>
        {MODE_TABS.map(t => (
          <button key={t.id} onMouseDown={() => setMode(t.id)} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "8px 10px", borderRadius: 10, cursor: t.id === "audio" ? "default" : "pointer",
            background: mode === t.id ? "rgba(255,255,255,.11)" : "transparent",
            border: `1px solid ${mode === t.id ? "rgba(255,255,255,.14)" : "transparent"}`,
            color: mode === t.id ? "var(--text)" : "var(--faint)",
            fontSize: 11.5, fontWeight: 600, transition: "all .15s", whiteSpace: "nowrap",
            opacity: t.id === "audio" ? 0.5 : 1,
          }}>
            <span style={{ fontSize: 13 }}>{t.icon}</span>
            <span>{t.label}</span>
            {t.id === "audio" && <span style={{ fontSize: 8, background: "rgba(255,176,0,.12)", color: "#ffb000", padding: "1px 5px", borderRadius: 4, fontWeight: 800 }}>SOON</span>}
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
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const firstImg = product?.media_urls?.[0];
        const imgUrl = firstImg?.startsWith("/")
          ? `${base}/api/v1/files/${firstImg.slice(1)}`
          : firstImg || "";
        const r = await api.get(`/jobs/${pendingJobId}/suggest-video-prompt`, {
          params: {
            style: pendingStyle,
            concept: answers.visual || "",
            image_url: imgUrl,
            ai_model: aiModel,
          },
        });
        setVideoPrompt(r.data.video_prompt || "");
      } catch { /* keep existing */ }
    };
    // pricing from billing API (loaded via useEffect on phase change — see below)
    const px = falPricing[aiModel];
    const clipUsd       = px?.usd_per_clip   ?? 0;
    const clipThb       = px?.thb_per_clip   ?? 0;
    const actualClips   = clipCount > 0 ? clipCount : Math.min(product?.media_urls?.length ?? 3, 3);
    const estimatedUsd  = clipUsd * actualClips;
    const estimatedThb  = clipThb * actualClips;
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
            <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 10, color: wordCount > 150 ? "#f87171" : "var(--faint)", fontWeight: 700 }}>
              {wordCount}/150 words
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

          {/* ── Model selector — เลือกก่อนจ่าย ── */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: "var(--dim)", fontWeight: 700, marginBottom: 8 }}>
              เลือก AI Model (กดเพื่อเปลี่ยน)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {MODEL_OPTIONS.map(m => {
                const active = aiModel === m.id;
                return (
                  <button key={m.id} onClick={() => setAiModel(m.id)} style={{
                    padding: "10px 12px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                    background: active ? `${m.color}18` : "rgba(255,255,255,.03)",
                    border: `1.5px solid ${active ? m.color : "var(--gb)"}`,
                    transition: "all .15s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: active ? m.color : "var(--dim)" }}>{m.label}</span>
                      {m.badge && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 6, background: active ? m.color : "rgba(255,255,255,.08)", color: active ? "#06060A" : "var(--faint)" }}>{m.badge}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--faint)" }}>{m.priceClip} · {m.price3clips}</div>
                  </button>
                );
              })}
            </div>
          </div>


          {/* Info chips */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { label: "Ratio", value: aspectRatio },
              { label: "Duration", value: `${pendingDurSec}s` },
              { label: "Style", value: pendingStyle },
              { label: "Voice", value: includeVoice ? "ON" : "OFF" },
              ...(aiModel !== "kenburs" ? [{ label: "Clips", value: clipCount === 0 ? `auto (${Math.min(product?.media_urls?.length ?? 3, 3)})` : `${clipCount}` }] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)", borderRadius: 8, padding: "4px 10px", fontSize: 11 }}>
                <span style={{ color: "var(--faint)" }}>{label}: </span>
                <b style={{ color: "var(--teal)" }}>{value}</b>
              </div>
            ))}
          </div>

          {/* Logo URL */}
          <div style={{ marginTop: 14 }}>
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

          {/* Balance + Cost breakdown */}
          {aiModel !== "kenburs" && (
            <div style={{ marginTop: 14, borderRadius: 12, border: "1px solid rgba(248,113,113,.25)", overflow: "hidden" }}>
              {/* Balance row */}
              <div style={{ padding: "10px 14px", background: "rgba(248,113,113,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#fca5a5", fontWeight: 700 }}>
                  💳 คงเหลือใน fal.ai:{" "}
                  {falBalance != null
                    ? <span style={{ color: falBalance < estimatedUsd ? "#f87171" : "#86efac" }}>
                        ${falBalance.toFixed(2)} (~{Math.round(falBalance * 35).toLocaleString()} บาท)
                        {falBalance < estimatedUsd && " ⚠️ ไม่พอ!"}
                      </span>
                    : balanceLoaded
                      ? <span style={{ color: "var(--faint)" }}>ดูยอดที่ <a href="https://fal.ai/dashboard/billing" target="_blank" rel="noopener" style={{ color: "var(--teal)", textDecoration: "none" }}>fal.ai dashboard</a></span>
                      : <span style={{ color: "var(--faint)" }}>กำลังดึง...</span>
                  }
                </div>
              </div>
              {/* Cost breakdown */}
              <div style={{ padding: "10px 14px", background: "rgba(0,0,0,.2)", fontSize: 12, color: "var(--faint)", lineHeight: 2 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                  <span>Model:</span><b style={{ color: "var(--dim)" }}>{modelLabel}</b>
                  <span>ราคา/คลิป (5 วิ):</span><b style={{ color: "#fbbf24" }}>${clipUsd.toFixed(2)} (~{clipThb.toFixed(0)} บาท)</b>
                  <span>จำนวนคลิป:</span><b style={{ color: "var(--dim)" }}>{actualClips} คลิป</b>
                  <span>ราคารวม (max):</span><b style={{ color: "#f87171", fontSize: 14 }}>${estimatedUsd.toFixed(2)} (~{estimatedThb.toFixed(0)} บาท)</b>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={runRender} style={{
              flex: 1, padding: "15px 20px", borderRadius: 14, cursor: "pointer",
              background: "linear-gradient(90deg,var(--teal),var(--blue))",
              border: "none", color: "#06060A", fontSize: 15, fontWeight: 900,
              boxShadow: "0 6px 24px rgba(0,255,212,.3)",
            }}>
              {aiModel === "kenburs"
                ? "สร้างวิดีโอ (ฟรี) →"
                : `ยืนยัน — สร้างวิดีโอ ~${estimatedThb.toFixed(0)} บาท →`}
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
