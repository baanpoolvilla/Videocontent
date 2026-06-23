"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Send, Loader2, Sparkles, ArrowUp, X, Plus,
  RefreshCw, CheckCircle2, ChevronDown,
} from "lucide-react";

interface Product { id: string; name: string; media_urls: string[]; }

type Phase = "home" | "story" | "generating" | "done" | "error";

interface ChatMsg {
  role: "user" | "ai" | "loading";
  text?: string;
  images?: string[];
  assets?: string[];
}

// ── Story Q&A flow (เหมือน agent.opus.pro) ─────────────────────────────────
const QUESTIONS = [
  {
    id: "brand",
    getAi: (prompt: string) =>
      `เข้าใจแล้ว — คุณอยากทำ${prompt} ฉันควรเรียนรู้เกี่ยวกับแบรนด์ของคุณสำหรับวิดีโอนี้อย่างไร?`,
    type: "text" as const,
    placeholder: "วาง URL เว็บแบรนด์ หรือพิมพ์ 'ใช้ Brand Profile ที่มีอยู่'",
    getAfter: (ans: string) =>
      ans.startsWith("http")
        ? `รับทราบ — ฉันจะใช้เว็บไซต์นี้เพื่อเรียนรู้เกี่ยวกับแบรนด์ คุณอยากให้วิดีโอนี้ยาวเท่าไหร่?`
        : `รับทราบ — จะใช้ Brand Profile ที่มีอยู่ คุณอยากให้วิดีโอนี้ยาวเท่าไหร่?`,
    loading: "✨ Learning about your brand, this will take about 2 minutes...",
  },
  {
    id: "duration",
    getAi: null,
    type: "choices" as const,
    choices: ["30 วินาที", "60 วินาที", "90 วินาที", "Something else..."],
    getAfter: (ans: string) =>
      `รับทราบ — วิดีโอ ${ans} ทิศทางและสไตล์วิดีโอที่อยากได้คือ?`,
  },
  {
    id: "style",
    getAi: null,
    type: "choices" as const,
    choices: ["🎨 Playful Overlay", "✨ Luxury Cinematic", "🎉 Party Vibes", "⬜ Minimal Clean"],
    getAfter: (ans: string) =>
      `เยี่ยม! เลือก ${ans} แล้ว Platform หลักที่จะโพสต์คือ?`,
  },
  {
    id: "platform",
    getAi: null,
    type: "choices" as const,
    choices: ["TikTok", "Instagram Reel", "Facebook", "YouTube Short"],
    getAfter: (ans: string) =>
      `รับทราบ — สร้างวิดีโอสำหรับ ${ans} ฉันมีข้อมูลครบแล้ว กำลังสร้างวิดีโอให้เลย...`,
  },
];

const MODE_TABS = [
  { id: "assets",  label: "Assets to Video", icon: "🖼️" },
  { id: "script",  label: "Script to Video", icon: "📝" },
  { id: "audio",   label: "Audio to Video",  icon: "🎵" },
  { id: "ads",     label: "Assets to Ads",   icon: "📢" },
];

export default function GeneratePage() {
  const router = useRouter();

  // ── state ─────────────────────────────────────────────────────────────────
  const [phase, setPhase]     = useState<Phase>("home");
  const [prompt, setPrompt]   = useState("");
  const [mode, setMode]       = useState("assets");
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct]   = useState<Product | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [qIndex, setQIndex]     = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [answers, setAnswers]   = useState<Record<string, string>>({});
  const [aiTyping, setAiTyping] = useState(false);
  const [brandLoading, setBrandLoading] = useState(false);

  const [elapsed, setElapsed]   = useState(0);
  const [errMsg, setErrMsg]     = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiTyping]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const pushMsg = (msg: ChatMsg) =>
    setMessages(prev => [...prev, msg]);

  const addAiTyping = async (text: string, delay = 600) => {
    setAiTyping(true);
    await sleep(delay);
    setAiTyping(false);
    pushMsg({ role: "ai", text });
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // ── start story mode ──────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!prompt.trim() && !product) return;
    const userPrompt = prompt.trim() || `สร้างวิดีโอสำหรับ ${product?.name}`;

    // user bubble with images + prompt
    pushMsg({
      role: "user",
      text: userPrompt,
      images: product?.media_urls?.slice(0, 3),
      assets: product ? [`📦 ${product.name}`] : [],
    });

    setPhase("story");
    setPrompt("");
    setQIndex(0);

    // first AI question
    const q0 = QUESTIONS[0];
    await addAiTyping(q0.getAi?.(userPrompt) ?? "", 800);
  };

  // ── handle each story answer ──────────────────────────────────────────────
  const handleAnswer = async (answer: string) => {
    const q = QUESTIONS[qIndex];
    const newAnswers = { ...answers, [q.id]: answer };
    setAnswers(newAnswers);

    // user bubble
    pushMsg({ role: "user", text: answer });
    setChatInput("");

    const afterText = q.getAfter?.(answer) ?? "";

    // brand learning loading state (after Q1 brand URL)
    if (q.id === "brand" && (q as typeof QUESTIONS[0]).loading) {
      await addAiTyping(afterText, 500);
      setBrandLoading(true);
      pushMsg({ role: "loading", text: (q as typeof QUESTIONS[0]).loading });
      await sleep(2500);
      setBrandLoading(false);
      setMessages(prev => prev.filter(m => m.role !== "loading"));
    } else {
      await addAiTyping(afterText, 500);
    }

    const nextIndex = qIndex + 1;

    if (nextIndex < QUESTIONS.length) {
      setQIndex(nextIndex);
      // if next question has no getAi, its text came from getAfter above
    } else {
      // all answered → generate
      await sleep(600);
      runGenerate(newAnswers);
    }
  };

  // ── run generation pipeline ───────────────────────────────────────────────
  const runGenerate = async (ans: Record<string, string>) => {
    if (!product) return;
    setPhase("generating");

    const start = Date.now();
    try {
      const durStr  = ans.duration  || "30 วินาที";
      const durSec  = durStr.includes("60") ? 60 : durStr.includes("90") ? 90 : 30;
      const styleId = (ans.style || "").includes("Luxury") ? "luxury"
                    : (ans.style || "").includes("Party")  ? "party"
                    : (ans.style || "").includes("Minimal") ? "minimal"
                    : "playful";
      const PLATFORM_MAP: Record<string, string> = {
        "tiktok": "tiktok",
        "instagram reel": "instagram",
        "instagram": "instagram",
        "facebook": "facebook",
        "youtube short": "youtube_shorts",
        "youtube shorts": "youtube_shorts",
        "youtube_short": "youtube_shorts",
      };
      const platformRaw = (ans.platform || "").toLowerCase().trim();
      const platform = PLATFORM_MAP[platformRaw] ?? "tiktok";

      const jobRes = await api.post("/jobs/", { product_id: product.id, platform });
      const jobId  = jobRes.data.id;

      try { await api.post(`/products/${product.id}/analyze`); } catch { /* already */ }

      const tone = ans.style?.includes("Luxury") ? "หรู พรีเมียม ซีเนมาติก"
                 : ans.style?.includes("Party")  ? "สนุก ปาร์ตี้ พลังงานสูง"
                 : ans.style?.includes("Minimal") ? "สะอาด ตรงประเด็น น้อยแต่มาก"
                 : "playful สีสัน ลูกเล่น เชิญชวน";

      const brandUrl = ans.brand?.startsWith("http") ? ans.brand : undefined;

      await api.post(`/jobs/${jobId}/generate-script`, null, {
        params: { tone_of_voice: tone, duration_sec: durSec, concept: brandUrl ? `แบรนด์: ${brandUrl}` : "" },
      });

      const voiceRes = await api.post(`/jobs/${jobId}/voiceover`, null, {
        params: { voice_style: "เป็นกันเอง (หญิง)" },
      });

      await api.post(`/jobs/${jobId}/render`, null, {
        params: { voiceover_url: voiceRes.data.voiceover_url, duration_sec: durSec, style: styleId },
      });

      setElapsed(Math.round((Date.now() - start) / 1000));
      setPhase("done");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("home");
    setMessages([]);
    setQIndex(0);
    setAnswers({});
    setChatInput("");
    setErrMsg("");
    setElapsed(0);
  };

  const currentQ = QUESTIONS[qIndex];

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (phase === "home") return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "40px 24px",
    }}>

      {/* Heading */}
      <h1 style={{
        margin: "0 0 36px", fontSize: 36, fontWeight: 900, textAlign: "center", lineHeight: 1.2,
        color: "var(--text)", letterSpacing: "-.03em",
      }}>
        Create your{" "}
        <span style={{ background: "linear-gradient(90deg,var(--teal),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          story video
        </span>
        {" "}today
      </h1>

      {/* Input card */}
      <div style={{
        width: "100%", maxWidth: 680,
        background: "#1a1a22", border: "1px solid var(--gb)", borderRadius: 20,
        padding: "20px 20px 14px", boxShadow: "0 8px 40px rgba(0,0,0,.4)",
        marginBottom: 20,
      }}>
        {/* Asset row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          {/* Product picker */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowPicker(v => !v)} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,.06)", border: "1px solid var(--gb)",
              borderRadius: 10, padding: "6px 12px", cursor: "pointer",
              fontSize: 12, fontWeight: 700, color: "var(--dim)",
            }}>
              <Plus size={13} />
              {product ? product.name : "เลือก Assets"}
              <ChevronDown size={11} />
            </button>
            {showPicker && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
                background: "var(--surface)", border: "1px solid var(--gb)",
                borderRadius: 12, overflow: "hidden", minWidth: 220, maxHeight: 200, overflowY: "auto",
                boxShadow: "0 8px 24px rgba(0,0,0,.5)",
              }}>
                {products.length === 0 ? (
                  <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--faint)" }}>
                    ยังไม่มีสินค้า
                  </div>
                ) : products.map(p => (
                  <div key={p.id} onClick={() => { setProduct(p); setShowPicker(false); }} style={{
                    padding: "10px 16px", cursor: "pointer", fontSize: 13,
                    background: product?.id === p.id ? "rgba(0,255,212,.06)" : "transparent",
                    color: product?.id === p.id ? "var(--teal)" : "var(--text)",
                    borderBottom: "1px solid var(--gb)",
                  }}>📦 {p.name}</div>
                ))}
              </div>
            )}
          </div>

          {/* Image thumbnails */}
          {product?.media_urls?.slice(0, 3).map((url, i) => (
            <div key={i} style={{
              width: 40, height: 40, borderRadius: 10, overflow: "hidden",
              border: "1px solid var(--gb)", flexShrink: 0,
            }}>
              <img src={url.startsWith("/") ? `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/files/${url.slice(1)}` : url}
                alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ))}

          {product && (
            <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: 4 }}>
              {product.media_urls?.length || 0} assets
            </span>
          )}
        </div>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="ทำเป็นรีวิวบ้านพลูวิลล่า แบบเชิญชวนมาพักผ่อน..."
          rows={2}
          style={{
            width: "100%", background: "transparent", border: "none", outline: "none",
            color: "var(--text)", fontSize: 15, lineHeight: 1.6, resize: "none",
            fontFamily: "inherit", marginBottom: 14,
          }}
        />

        {/* Bottom row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Option badges */}
          {[
            { label: "Caption", icon: "🔠" },
            { label: "9:16",    icon: "📱" },
            { label: "AI model",icon: "✨" },
          ].map(b => (
            <button key={b.label} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 8, cursor: "pointer",
              background: "rgba(255,255,255,.06)", border: "1px solid var(--gb)",
              color: "var(--dim)", fontSize: 12, fontWeight: 600,
            }}>
              <span>{b.icon}</span> {b.label}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Send button */}
          <button onClick={handleSend} disabled={!prompt.trim() && !product} style={{
            width: 40, height: 40, borderRadius: "50%", cursor: (prompt.trim() || product) ? "pointer" : "not-allowed",
            background: (prompt.trim() || product) ? "#fff" : "rgba(255,255,255,.12)",
            border: "none", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background .15s",
          }}>
            <ArrowUp size={18} color={(prompt.trim() || product) ? "#000" : "#555"} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {MODE_TABS.map(t => (
          <button key={t.id} onClick={() => setMode(t.id)} style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 18px", borderRadius: 10, cursor: "pointer",
            background: mode === t.id ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)",
            border: `1px solid ${mode === t.id ? "rgba(255,255,255,.2)" : "var(--gb)"}`,
            color: mode === t.id ? "var(--text)" : "var(--faint)",
            fontSize: 13, fontWeight: 600, transition: "all .15s",
          }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tagline */}
      <p style={{ marginTop: 40, fontSize: 14, fontWeight: 700, color: "var(--faint)" }}>
        ✨ Get inspired. Then make it yours.
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── STORY MODE ────────────────────────────────────────────────────────────
  if (phase === "story") return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 24px",
        borderBottom: "1px solid var(--gb)", flexShrink: 0,
      }}>
        <button onClick={reset} style={{
          fontSize: 13, fontWeight: 700, color: "var(--faint)", background: "none",
          border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
        }}>← Projects</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--faint)" }}>
          {qIndex + 1} / {QUESTIONS.length} คำถาม
        </span>
      </div>

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 0" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 20,
            }}>
              {msg.role === "user" && (
                <div style={{ maxWidth: "75%" }}>
                  {/* Asset tags */}
                  {msg.assets && msg.assets.length > 0 && (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginBottom: 6, flexWrap: "wrap" }}>
                      {msg.assets.map((a, j) => (
                        <span key={j} style={{
                          fontSize: 11.5, fontWeight: 700, padding: "3px 10px",
                          background: "rgba(255,255,255,.08)", border: "1px solid var(--gb)",
                          borderRadius: 20, color: "var(--dim)",
                        }}>{a}</span>
                      ))}
                    </div>
                  )}
                  {/* User bubble */}
                  <div style={{
                    background: "#2a2a35", border: "1px solid var(--gb)",
                    borderRadius: "18px 18px 4px 18px",
                    padding: "12px 16px", fontSize: 14, color: "var(--text)", lineHeight: 1.6,
                  }}>
                    {msg.text}
                  </div>
                  {/* Image thumbnails */}
                  {msg.images && msg.images.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                      {msg.images.map((url, j) => (
                        <div key={j} style={{
                          width: 60, height: 60, borderRadius: 10, overflow: "hidden",
                          border: "1px solid var(--gb)",
                        }}>
                          <img src={url.startsWith("/") ? `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/files/${url.slice(1)}` : url}
                            alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {msg.role === "ai" && (
                <div style={{ maxWidth: "80%", fontSize: 14, color: "var(--text)", lineHeight: 1.8 }}>
                  {msg.text}
                </div>
              )}

              {msg.role === "loading" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 13, color: "var(--faint)", fontStyle: "italic",
                }}>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  {msg.text}
                </div>
              )}
            </div>
          ))}

          {/* AI typing indicator */}
          {aiTyping && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: "50%", background: "var(--faint)",
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          )}

          {/* Current question choices */}
          {!aiTyping && !brandLoading && phase === "story" && currentQ?.type === "choices" && (
            <div style={{ marginTop: 8, marginBottom: 20 }}>
              {currentQ.choices!.map((choice, i) => (
                <button
                  key={choice}
                  onClick={() => handleAnswer(choice)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    padding: "14px 18px", borderRadius: 12, cursor: "pointer",
                    background: "#1e1e28", border: "1px solid var(--gb)",
                    color: "var(--text)", fontSize: 14, fontWeight: 600,
                    marginBottom: 8, textAlign: "left", transition: "all .12s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#2a2a38")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#1e1e28")}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                    background: "rgba(255,255,255,.08)", border: "1px solid var(--gb)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: "var(--dim)",
                  }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {choice}
                </button>
              ))}
              {/* Custom text input */}
              <button style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "12px 18px", borderRadius: 12, cursor: "pointer",
                background: "transparent", border: "1px dashed var(--gb)",
                color: "var(--faint)", fontSize: 13, textAlign: "left",
              }}
                onClick={() => {
                  const val = window.prompt("พิมพ์คำตอบของคุณ:");
                  if (val) handleAnswer(val);
                }}
              >
                ✏️ Something else...
              </button>
            </div>
          )}

          {/* Text input question */}
          {!aiTyping && !brandLoading && phase === "story" && currentQ?.type === "text" && (
            <form onSubmit={e => { e.preventDefault(); if (chatInput.trim()) handleAnswer(chatInput.trim()); }}
              style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "flex-end" }}>
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
              <button type="submit" disabled={!chatInput.trim()} style={{
                width: 42, height: 42, borderRadius: 10, cursor: chatInput.trim() ? "pointer" : "not-allowed",
                background: chatInput.trim() ? "#fff" : "rgba(255,255,255,.1)",
                border: "none", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
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
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "var(--bg)", gap: 20,
    }}>
      <div style={{ position: "relative", width: 80, height: 80 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(0,255,212,.15)" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "var(--teal)", animation: "spin 1s linear infinite" }} />
        <Sparkles size={28} color="var(--teal)" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
          กำลังสร้างวิดีโอ...
        </div>
        <div style={{ fontSize: 13, color: "var(--faint)" }}>
          {answers.style || "AI"} · {answers.platform || "TikTok"} · {answers.duration || "30 วินาที"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {["วิเคราะห์", "Script", "Voice", "Render"].map((s, i) => (
          <div key={s} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.2)",
            color: "var(--teal)",
          }}>{s}</div>
        ))}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── DONE ──────────────────────────────────────────────────────────────────
  if (phase === "done") return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "var(--bg)", gap: 20, padding: 40,
    }}>
      <div style={{ position: "relative", width: 100, height: 100 }}>
        <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "conic-gradient(var(--teal),var(--blue),var(--teal))", animation: "spin 3s linear infinite", opacity: .6 }} />
        <div style={{ position: "absolute", inset: -3, borderRadius: "50%", background: "var(--bg)" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={44} color="var(--ok)" strokeWidth={1.5} />
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, background: "linear-gradient(90deg,var(--teal),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          สร้างสำเร็จ!
        </h2>
        <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--dim)" }}>
          {product?.name} · {answers.style} · {answers.platform}
        </p>
        {elapsed > 0 && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--faint)" }}>
            ใช้เวลา {elapsed >= 60 ? `${Math.floor(elapsed / 60)} นาที ${elapsed % 60} วิ` : `${elapsed} วินาที`}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 340 }}>
        <button onClick={() => router.push("/preview")} style={{
          padding: "14px 20px", borderRadius: 14, cursor: "pointer",
          background: "linear-gradient(90deg,var(--teal),var(--blue))",
          border: "none", color: "#06060A", fontSize: 15, fontWeight: 900,
          boxShadow: "0 6px 24px rgba(0,255,212,.3)",
        }}>
          ดูวิดีโอใน Preview →
        </button>
        <button onClick={reset} style={{
          padding: "12px 20px", borderRadius: 14, cursor: "pointer",
          background: "rgba(255,255,255,.05)", border: "1px solid var(--gb)",
          color: "var(--faint)", fontSize: 13, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <RefreshCw size={13} /> สร้างวิดีโอใหม่
        </button>
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
