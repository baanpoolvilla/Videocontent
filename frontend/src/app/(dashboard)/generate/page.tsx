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
type AIModel = "kenburs" | "hailuo2pro" | "wan21" | "kling3s" | "kling3s_pro" | "seedance2" | "seedance2_pro" | "seedance2_multi";

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
const MODEL_OPTIONS: { id: AIModel; label: string; desc: string; maxClipSec: number; priceClip: string; badge?: string; color: string; features: string[]; multiPhoto: boolean }[] = [
  { id: "kenburs",       label: "Ken Burns",            desc: "รูปนิ่ง + zoom/pan — ไม่ใช้ AI",             maxClipSec: 99, priceClip: "ฟรี",           badge: "FREE", color: "#22D499", multiPhoto: true,  features: ["ฟรี 100%", "zoom/pan", "ไม่ใช้ AI", "ไม่จำกัดเวลา"] },
  { id: "wan21",         label: "Wan 2.2 Turbo",        desc: "Alibaba — เร็ว คุณภาพ 14B ราคาถูกสุด",       maxClipSec: 5,  priceClip: "$0.10 / คลิป", badge: "ถูกสุด", color: "#34D399", multiPhoto: true,  features: ["720p · max quality", "5s/คลิป", "multi-photo ✓", "smooth transition"] },
  { id: "hailuo2pro",    label: "Hailuo 2.3 Pro",       desc: "Minimax — motion ลื่น atmospheric",           maxClipSec: 10, priceClip: "$0.49 / คลิป", badge: "ถูก",   color: "#A78BFA", multiPhoto: false, features: ["smooth motion", "prompt optimizer", "6s หรือ 10s", "1 รูป/คลิป"] },
  { id: "kling3s",       label: "Kling v3 Standard",    desc: "Kuaishou — AI motion จริง คมชัด สมจริง",      maxClipSec: 10, priceClip: "$1.89 / คลิป",             color: "#00FFD4", multiPhoto: true,  features: ["cinematic motion", "5s หรือ 10s", "multi-photo ✓", "negative prompt ✓"] },
  { id: "seedance2",     label: "Seedance 2.0 Fast",    desc: "ByteDance — เร็ว ลื่น สมจริง",                maxClipSec: 15, priceClip: "$2.43 / คลิป",             color: "#4D7FFF", multiPhoto: true,  features: ["1080p HD", "4–15s ยืดหยุ่น", "multi-photo ✓", "natural motion"] },
  { id: "kling3s_pro",   label: "Kling v3 Pro",         desc: "Kuaishou — ระดับภาพยนตร์ detail สูงสุด",      maxClipSec: 10, priceClip: "$2.88 / คลิป", badge: "Pro",   color: "#818CF8", multiPhoto: true,  features: ["studio grade", "5s หรือ 10s", "multi-photo ✓", "fine detail · complex motion"] },
  { id: "seedance2_pro", label: "Seedance 2.0 Pro",     desc: "ByteDance คุณภาพสูงสุด — 4K high bitrate",    maxClipSec: 15, priceClip: "$4.25 / คลิป", badge: "4K",    color: "#FF6B6B", multiPhoto: true,  features: ["4K resolution", "high bitrate", "4–15s ยืดหยุ่น", "multi-photo ✓"] },
  { id: "seedance2_multi",label: "Seedance Multi-Shot ✨", desc: "9 รูปใน 1 API call — AI สร้าง transition เอง", maxClipSec: 15, priceClip: "$4.25 / วิดีโอ", badge: "BEST", color: "#F59E0B", multiPhoto: true,  features: ["9 รูป/วิดีโอ", "AI transitions", "720p", "no black cuts"] },
];

const MODEL_MAX_CLIP_SEC: Record<AIModel, number> = Object.fromEntries(
  MODEL_OPTIONS.map(m => [m.id, m.maxClipSec])
) as Record<AIModel, number>;

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
  const [isDirectRender, setIsDirectRender] = useState(false);
  const [mode, setMode]         = useState<Mode>("assets");
  const [prompt, setPrompt]     = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct]   = useState<Product | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // badge state
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [aiModel, setAiModel]         = useState<AIModel>(() => {
    if (typeof window === "undefined") return "wan21";
    return (localStorage.getItem("preferred_ai_model") as AIModel) || "wan21";
  });
  const setAiModelPersist = (m: AIModel) => { setAiModel(m); localStorage.setItem("preferred_ai_model", m); };
  const [captions, setCaptions]       = useState(false);
  const [includeVoice, setIncludeVoice] = useState(true);
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

    // Fast path: assets mode + product → always skip Q&A, use slider/dropdown values
    if (mode === "assets" && product) {
      const autoAnswers = {
        visual: userPrompt,
        duration: `${quickDuration} วิ`,
        style: quickStyle || "✨ Luxury หรูหรา",
        platform: "TikTok",
      };
      setAnswers(autoAnswers);
      runGenerate(autoAnswers);
      return;
    }

    // Story path: non-assets mode → Q&A flow
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
            tone: quickTone,
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

  // ── direct render: skip all AI, use user's prompt straight to fal.ai ────────
  const runDirectRender = async () => {
    if (!product || !prompt.trim()) return;
    setIsDirectRender(true);
    setPhase("generating");
    try {
      const jobRes = await api.post("/jobs/", { product_id: product.id, platform: "tiktok" });
      setPendingJobId(jobRes.data.id);
      setPendingVoiceUrl("");
      setPendingDurSec(quickDuration);
      setPendingStyle("playful");
      setVideoPrompt(prompt.trim());
      setPrompt("");
      setPhase("prompt_edit");
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      setErrMsg(ax.response?.data?.detail || ax.message || "เกิดข้อผิดพลาด");
      setIsDirectRender(false);
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
          clip_count:    aiModel === "kenburs" ? 1 : Math.ceil(pendingDurSec / (MODEL_MAX_CLIP_SEC[aiModel] ?? 5)),
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
    setRenderVideoUrl(""); setLogoUrl(""); setIsDirectRender(false);
  };

  const currentQ = questions[qIndex];

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (phase === "home") return (
    <div style={{
      height: "100vh",
      background: "radial-gradient(ellipse 80% 55% at 5% -5%, rgba(0,255,212,.07) 0%, transparent 50%), radial-gradient(ellipse 70% 45% at 95% 105%, rgba(77,127,255,.06) 0%, transparent 50%), var(--bg)",
      display: "flex", flexDirection: "column",
      padding: "14px 20px 16px", overflow: "hidden",
    }}>

      {/* Header: title + mode tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--text)", letterSpacing: "-.02em" }}>
          Create your{" "}
          <span style={{ background: "linear-gradient(90deg,#00ffd4,#6ee7ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            story video
          </span>{" "}today
        </h1>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 11, padding: 2, flexShrink: 0 }}>
          {MODE_TABS.map(t => (
            <button key={t.id} onMouseDown={() => setMode(t.id)} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 9, cursor: t.id === "audio" ? "default" : "pointer",
              background: mode === t.id ? "rgba(255,255,255,.1)" : "transparent",
              border: `1px solid ${mode === t.id ? "rgba(255,255,255,.12)" : "transparent"}`,
              color: mode === t.id ? "var(--text)" : "var(--faint)",
              fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
              opacity: t.id === "audio" ? 0.5 : 1, transition: "all .15s",
            }}>
              <span style={{ fontSize: 12 }}>{t.icon}</span>
              <span>{t.label}</span>
              {t.id === "audio" && <span style={{ fontSize: 8, background: "rgba(255,176,0,.12)", color: "#ffb000", padding: "1px 5px", borderRadius: 4, fontWeight: 800 }}>SOON</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Main card — 2 columns */}
      <div style={{
        flex: 1, minHeight: 0,
        background: "linear-gradient(150deg, #1e1e2c 0%, #19191f 60%, #17171e 100%)",
        border: "1px solid rgba(255,255,255,.08)", borderRadius: 18,
        boxShadow: "0 0 60px rgba(0,255,212,.04), 0 20px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)",
        display: "flex", overflow: "hidden",
      }}>

        {/* LEFT: prompt input */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "18px 20px", position: "relative", background: "linear-gradient(180deg, rgba(0,255,212,.02) 0%, transparent 22%)" }}>

          {/* Asset picker row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexShrink: 0 }}>
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
          </div>
          {product && (product.media_urls?.length ?? 0) > 0 && (
            <div style={{ display: "flex", gap: 7, overflowX: "auto", marginBottom: 12, flexShrink: 0, scrollbarWidth: "none" as const, paddingBottom: 2 }}>
              {product.media_urls.map((url, i) => (
                <div key={i} style={{ width: 56, height: 90, borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
                  <img src={imgProxy(url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={
              mode === "script" ? "พิมพ์หัวข้อ หรือคอนเซ็ปต์ที่ต้องการ..."
              : mode === "ads"  ? "ทำ Ad โปรโมท pool villa พร้อม offer พิเศษ..."
              : "ทำเป็นรีวิวบ้านพลูวิลล่า แบบเชิญชวนมาพักผ่อน..."
            }
            style={{
              flex: 1, minHeight: 80, width: "100%", background: "transparent", border: "none", outline: "none",
              color: "var(--text)", fontSize: 17, lineHeight: 2, resize: "none",
              fontFamily: "inherit", boxSizing: "border-box",
            }}
          />

          {/* Inspiration prompts — visible when textarea empty */}
          {!prompt && (
            <div style={{ position: "absolute", bottom: 18, left: 20, right: 20, pointerEvents: "none" }}>
              <p style={{ margin: "0 0 7px", fontSize: 9.5, color: "rgba(255,255,255,.2)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>ไอเดีย</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, pointerEvents: "all" }}>
                {[
                  "รีวิว pool villa แบบ luxury cinematic",
                  "Showcase สระน้ำ + วิว skyline ยามเย็น",
                  "Villa ริมทะเล บรรยากาศ tropical resort",
                  "โปรโมทราคาพิเศษ + CTA ชัดเจน",
                ].map(ex => (
                  <button key={ex} onMouseDown={() => setPrompt(ex)} style={{
                    padding: "5px 13px", borderRadius: 20,
                    background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)",
                    color: "rgba(255,255,255,.45)", fontSize: 11.5, cursor: "pointer",
                    backdropFilter: "blur(8px)",
                  }}>{ex}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: "rgba(255,255,255,.05)", flexShrink: 0 }} />

        {/* RIGHT: options + send */}
        <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", padding: "18px 16px", overflowY: "auto", background: "rgba(0,0,0,.15)" }}>

          {mode === "assets" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>

              {/* ความยาว */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 2, height: 10, borderRadius: 1, background: "var(--teal)", flexShrink: 0 }} />
                    <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em" }}>ความยาว</div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "var(--teal)" }}>{quickDuration}s</span>
                </div>
                <input
                  type="range" min={5} max={60} step={5}
                  value={quickDuration}
                  onChange={e => setQuickDuration(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--teal)", cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--faint)", marginTop: 2 }}>
                  <span>5s</span><span>30s</span><span>60s</span>
                </div>
                {aiModel !== "kenburs" && (() => {
                  const maxSec = MODEL_MAX_CLIP_SEC[aiModel];
                  const clips = Math.ceil(quickDuration / maxSec);
                  return clips > 1 ? (
                    <div style={{ marginTop: 5, fontSize: 10, color: "#fbbf24", background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 6, padding: "4px 8px" }}>
                      {quickDuration}s ÷ {maxSec}s = <b>{clips} คลิป AI</b>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* โทน */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                  <div style={{ width: 2, height: 10, borderRadius: 1, background: "#22D499", flexShrink: 0 }} />
                  <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em" }}>โทน</div>
                </div>
                <select value={quickTone} onChange={e => setQuickTone(e.target.value)} style={{
                  width: "100%", background: "#1b1c2a", border: "1px solid rgba(34,212,153,.35)",
                  borderRadius: 8, padding: "8px 10px", color: "#22D499",
                  fontSize: 12, fontWeight: 700, outline: "none", cursor: "pointer",
                }}>
                  <option value="หรู พรีเมียม ซีเนมาติก">🎬 Cinematic</option>
                  <option value="ผ่อนคลาย พักผ่อน ชวนมาเที่ยว">🏖️ Vacation</option>
                  <option value="สนุก มีชีวิตชีวา เชิญชวน">🎉 Lively</option>
                  <option value="มืออาชีพ กระชับ ข้อมูลครบ">💼 Pro</option>
                  <option value="อบอุ่น เป็นกันเอง เชิญชวน">😊 Warm</option>
                  <option value="เล่าเรื่อง อารมณ์ ความรู้สึก">📖 Story</option>
                </select>
              </div>

              {/* เสียง */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                  <div style={{ width: 2, height: 10, borderRadius: 1, background: "#4D7FFF", flexShrink: 0 }} />
                  <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em" }}>เสียง</div>
                </div>
                {includeVoice ? (
                  <select value={quickVoice} onChange={e => setQuickVoice(e.target.value)} style={{
                    width: "100%", background: "#1b1c2a", border: "1px solid rgba(77,127,255,.35)",
                    borderRadius: 8, padding: "8px 10px", color: "#4D7FFF",
                    fontSize: 12, fontWeight: 700, outline: "none", cursor: "pointer",
                  }}>
                    <option value="หญิง (ไทย)">👩 หญิง 1</option>
                    <option value="หญิง 2 (ไทย)">👩 หญิง 2</option>
                    <option value="ชาย (ไทย)">👨 ชาย</option>
                  </select>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--faint)", fontStyle: "italic" }}>ปิดอยู่</div>
                )}
              </div>

              {/* หน้าจอ */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                  <div style={{ width: 2, height: 10, borderRadius: 1, background: "#FBBF24", flexShrink: 0 }} />
                  <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em" }}>หน้าจอ</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {([
                    { ar: "9:16" as AspectRatio, label: "📱 9:16", sub: "TikTok" },
                    { ar: "1:1"  as AspectRatio, label: "⬜ 1:1",  sub: "Square" },
                    { ar: "16:9" as AspectRatio, label: "🖥 16:9", sub: "YouTube" },
                  ] as { ar: AspectRatio; label: string; sub: string }[]).map(o => (
                    <button key={o.ar} onMouseDown={() => setAspectRatio(o.ar)} style={{
                      flex: 1, padding: "7px 6px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                      background: aspectRatio === o.ar ? "rgba(251,191,36,.1)" : "rgba(255,255,255,.04)",
                      border: `1px solid ${aspectRatio === o.ar ? "rgba(251,191,36,.4)" : "var(--gb)"}`,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: aspectRatio === o.ar ? "#FBBF24" : "var(--dim)" }}>{o.label}</div>
                      <div style={{ fontSize: 9, color: "var(--faint)" }}>{o.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Toggles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onMouseDown={() => setIncludeVoice(v => !v)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 8px",
              borderRadius: 8, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
              background: includeVoice ? "rgba(77,127,255,.12)" : "rgba(255,255,255,.05)",
              border: `1px solid ${includeVoice ? "rgba(77,127,255,.4)" : "var(--gb)"}`,
              color: includeVoice ? "#4D7FFF" : "var(--dim)",
            }}>
              🎙 {includeVoice ? "ON" : "OFF"}
            </button>
            <button onMouseDown={() => setCaptions(v => !v)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 8px",
              borderRadius: 8, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
              background: captions ? "rgba(0,255,212,.12)" : "rgba(255,255,255,.05)",
              border: `1px solid ${captions ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
              color: captions ? "var(--teal)" : "var(--dim)",
            }}>
              🔠 {captions ? "ON" : "OFF"}
            </button>
          </div>

          {/* Model dropdown */}
          <div ref={modelRef} style={{ position: "relative", marginBottom: 10 }}>
            <button onMouseDown={() => setShowModelMenu(v => !v)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "9px 12px",
              borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: showModelMenu ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.05)",
              border: `1px solid ${showModelMenu ? "rgba(255,255,255,.2)" : "var(--gb)"}`,
              color: MODEL_OPTIONS.find(m => m.id === aiModel)?.color || "var(--dim)",
            }}>
              <span style={{ flex: 1, textAlign: "left" }}>✨ {MODEL_OPTIONS.find(m => m.id === aiModel)?.label}</span>
              <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 400 }}>{MODEL_OPTIONS.find(m => m.id === aiModel)?.priceClip}</span>
              {showModelMenu ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showModelMenu && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0, zIndex: 200,
                background: "#16161f", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12,
                maxHeight: "65vh", overflowY: "auto", boxShadow: "0 -12px 40px rgba(0,0,0,.7)",
              }}>
                {MODEL_OPTIONS.map(m => {
                  const active = aiModel === m.id;
                  return (
                    <button key={m.id} onMouseDown={() => { setAiModelPersist(m.id); setShowModelMenu(false); }} style={{
                      width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
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
                        <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 5 }}>{m.desc}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {m.features.map(f => (
                            <span key={f} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, fontWeight: 600,
                              background: active ? `${m.color}18` : "rgba(255,255,255,.06)",
                              color: active ? m.color : "rgba(255,255,255,.45)",
                              border: `1px solid ${active ? `${m.color}30` : "rgba(255,255,255,.06)"}`,
                            }}>{f}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, paddingTop: 2 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: active ? m.color : "var(--dim)" }}>{m.priceClip}</div>
                        <div style={{ fontSize: 9.5, color: "var(--faint)" }}>{m.maxClipSec === 99 ? "ไม่จำกัด" : `max ${m.maxClipSec}s`}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected model capability strip + multi-photo warning */}
          {(() => {
            const sel = MODEL_OPTIONS.find(m => m.id === aiModel);
            if (!sel) return null;
            const imgCount = product?.media_urls?.length ?? 0;
            const showWarn = !sel.multiPhoto && imgCount > 1;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {sel.features.map(f => (
                    <span key={f} style={{ fontSize: 10, padding: "3px 9px", borderRadius: 12, fontWeight: 600,
                      background: `${sel.color}15`, color: sel.color,
                      border: `1px solid ${sel.color}30`,
                    }}>{f}</span>
                  ))}
                </div>
                {showWarn && (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px",
                    background: "rgba(251,146,60,.08)", border: "1px solid rgba(251,146,60,.35)",
                    borderRadius: 10, fontSize: 11, color: "#FB923C", lineHeight: 1.5,
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
                    <span>
                      <b>Hailuo ใช้รูปแรกเพียงรูปเดียว</b> — ไม่รองรับ multi-photo<br />
                      เปลี่ยนเป็น <b>Kling / Seedance / Wan</b> เพื่อใช้ทุกรูป ({imgCount} รูป)
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Send — AI optimize */}
          <button
            onMouseDown={handleSend}
            disabled={!prompt.trim() && !product}
            style={{
              width: "100%", padding: "13px 16px", borderRadius: 12,
              cursor: (prompt.trim() || product) ? "pointer" : "not-allowed",
              background: (prompt.trim() || product) ? "linear-gradient(90deg,var(--teal),var(--blue))" : "rgba(255,255,255,.08)",
              border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              color: (prompt.trim() || product) ? "#06060A" : "var(--faint)",
              fontSize: 14, fontWeight: 800,
              boxShadow: (prompt.trim() || product) ? "0 4px 20px rgba(0,255,212,.25)" : "none",
            }}>
            <Sparkles size={15} strokeWidth={2.5} />
            {prompt.trim() ? "AI ช่วยปรับ Prompt" : "สร้างวิดีโอ"}
          </button>

          {/* Direct render — skip AI, send user prompt straight to fal.ai */}
          {prompt.trim() && product && aiModel !== "kenburs" && (
            <>
              {/[฀-๿]/.test(prompt) && (
                <div style={{ fontSize: 11, color: "#f87171", marginTop: 6, padding: "6px 10px", borderRadius: 8, background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.25)" }}>
                  ⚠ Prompt ต้องเป็นภาษาอังกฤษเท่านั้น — ภาษาไทยจะถูกตัดออก
                </div>
              )}
              <button
                onMouseDown={runDirectRender}
                disabled={/[฀-๿]/.test(prompt)}
                style={{
                  width: "100%", padding: "9px 16px", borderRadius: 10, marginTop: 6,
                  cursor: /[฀-๿]/.test(prompt) ? "not-allowed" : "pointer",
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(255,255,255,.06)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  color: /[฀-๿]/.test(prompt) ? "var(--faint)" : "var(--text)", fontSize: 12, fontWeight: 700,
                  opacity: /[฀-๿]/.test(prompt) ? 0.5 : 1,
                }}>
                <ArrowUp size={13} strokeWidth={2.5} />
                ใช้ Prompt ของฉันเลย
              </button>
            </>
          )}


        </div>
      </div>

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
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>{isDirectRender ? "กำลังเตรียมงาน..." : "กำลังสร้าง Script + Voice..."}</div>
        <div style={{ fontSize: 13, color: "var(--faint)" }}>{isDirectRender ? "เตรียม job สำหรับ prompt ของคุณ" : "AI กำลังเขียน script และสร้างเสียงให้"}</div>
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
            tone: quickTone,
          },
        });
        setVideoPrompt(r.data.video_prompt || "");
      } catch { /* keep existing */ }
    };
    // pricing from billing API (loaded via useEffect on phase change — see below)
    const px = falPricing[aiModel];
    const clipUsd       = px?.usd_per_clip   ?? 0;
    const clipThb       = px?.thb_per_clip   ?? 0;
    const maxClipSec    = MODEL_MAX_CLIP_SEC[aiModel] ?? 5;
    const actualClips   = aiModel === "kenburs" ? 1 : Math.ceil(pendingDurSec / maxClipSec);
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
            <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 10, color: wordCount > 300 ? "#f87171" : "var(--faint)", fontWeight: 700 }}>
              {wordCount}/300 words
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
                  <button key={m.id} onClick={() => setAiModelPersist(m.id)} style={{
                    padding: "10px 12px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                    background: active ? `${m.color}18` : "rgba(255,255,255,.03)",
                    border: `1.5px solid ${active ? m.color : "var(--gb)"}`,
                    transition: "all .15s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: active ? m.color : "var(--dim)" }}>{m.label}</span>
                      {m.badge && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 6, background: active ? m.color : "rgba(255,255,255,.08)", color: active ? "#06060A" : "var(--faint)" }}>{m.badge}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 5 }}>{m.priceClip} · {m.maxClipSec === 99 ? "ไม่จำกัด" : `max ${m.maxClipSec}s`}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {m.features.slice(0, 3).map(f => (
                        <span key={f} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 8, fontWeight: 600,
                          background: active ? `${m.color}18` : "rgba(255,255,255,.05)",
                          color: active ? m.color : "rgba(255,255,255,.35)",
                        }}>{f}</span>
                      ))}
                    </div>
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
              ...(aiModel !== "kenburs" ? [{ label: "Clips", value: `${actualClips} (${pendingDurSec}s ÷ ${MODEL_MAX_CLIP_SEC[aiModel] ?? 5}s)` }] : []),
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

          {/* Multi-photo warning for Hailuo */}
          {(() => {
            const sel = MODEL_OPTIONS.find(m => m.id === aiModel);
            const imgCount = product?.media_urls?.length ?? 0;
            if (!sel || sel.multiPhoto || imgCount <= 1) return null;
            return (
              <div style={{
                marginTop: 12, display: "flex", alignItems: "flex-start", gap: 8,
                padding: "10px 14px", background: "rgba(251,146,60,.08)",
                border: "1px solid rgba(251,146,60,.4)", borderRadius: 12,
                fontSize: 12, color: "#FB923C", lineHeight: 1.6,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
                <div>
                  <b>Hailuo ใช้รูปแรกเพียงรูปเดียว</b> — ไม่รองรับ end_image / multi-photo<br />
                  เปลี่ยนเป็น <b>Kling · Seedance · Wan</b> ด้านบนเพื่อให้ AI ใช้ทุกรูป ({imgCount} รูป)
                </div>
              </div>
            );
          })()}

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
