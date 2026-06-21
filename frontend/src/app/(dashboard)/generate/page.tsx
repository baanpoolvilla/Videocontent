"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Zap, FileText, Mic2, Film, CheckCircle2, Loader2, ChevronRight,
  Package, Copy, RotateCcw, Download, Play,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  category: string | null;
  media_urls: string[];
}

interface Job {
  id: string;
  product_id: string;
  status: string;
}

interface Script {
  id: string;
  hook: string | null;
  body: string | null;
  cta: string | null;
  full_script: string | null;
  version: number;
}

type Step = "product" | "analyze" | "script" | "voice" | "render" | "done";

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: "product", label: "เลือกสินค้า",   icon: Package },
  { id: "analyze", label: "วิเคราะห์ AI",  icon: Zap },
  { id: "script",  label: "สร้าง Script",  icon: FileText },
  { id: "voice",   label: "เสียงพากย์",    icon: Mic2 },
  { id: "render",  label: "เรนเดอร์วิดีโอ", icon: Film },
  { id: "done",    label: "เสร็จสิ้น",      icon: CheckCircle2 },
];

const STEP_INDEX: Record<Step, number> = {
  product: 0, analyze: 1, script: 2, voice: 3, render: 4, done: 5,
};

export default function GeneratePage() {
  const [step, setStep]       = useState<Step>("product");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [job, setJob]         = useState<Job | null>(null);
  const [script, setScript]   = useState<Script | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string>("");
  const [renderUrl, setRenderUrl] = useState<string>("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string>("");
  const [tone, setTone]       = useState("สนุก, กระชับ, ดึงดูด");
  const [cta, setCta]         = useState("สั่งซื้อเลย");
  const [duration, setDuration] = useState(30);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.get("/products/").then((r) => setProducts(r.data)).catch(() => {});
  }, []);

  const curIdx = STEP_INDEX[step];

  const runStep = async () => {
    setBusy(true);
    setError("");
    try {
      if (step === "product") {
        if (!selectedProduct) { setError("กรุณาเลือกสินค้าก่อน"); return; }
        const res = await api.post("/jobs/", {
          product_id: selectedProduct.id,
          platform: "tiktok",
          target_duration_sec: duration,
        });
        setJob(res.data);
        setStep("analyze");
      }
      else if (step === "analyze") {
        if (!selectedProduct) return;
        const res = await api.post(`/products/${selectedProduct.id}/analyze`);
        setAnalysis(res.data);
        setStep("script");
      }
      else if (step === "script") {
        if (!job) return;
        const res = await api.post(
          `/jobs/${job.id}/generate-script?tone_of_voice=${encodeURIComponent(tone)}&cta_style=${encodeURIComponent(cta)}&duration_sec=${duration}`
        );
        setScript(res.data);
        setStep("voice");
      }
      else if (step === "voice") {
        if (!job) return;
        const res = await api.post(`/jobs/${job.id}/voiceover`);
        setVoiceUrl(res.data.voiceover_url || "");
        setStep("render");
      }
      else if (step === "render") {
        if (!job) return;
        const res = await api.post(`/jobs/${job.id}/render?voiceover_url=${encodeURIComponent(voiceUrl)}&duration_sec=${duration}`);
        setRenderUrl(res.data.video_url || "");
        setStep("done");
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "เกิดข้อผิดพลาด";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep("product"); setSelectedProduct(null); setJob(null);
    setScript(null); setVoiceUrl(""); setRenderUrl(""); setError(""); setAnalysis(null);
  };

  const btnLabel: Record<Step, string> = {
    product: "สร้าง Job & ต่อไป",
    analyze: "วิเคราะห์สินค้า",
    script:  "สร้าง Script",
    voice:   "สร้างเสียงพากย์",
    render:  "เรนเดอร์วิดีโอ",
    done:    "สร้างใหม่",
  };

  return (
    <div className="page-enter" style={{ padding: "32px 40px", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
          04 · สร้างคอนเทนต์
        </p>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>
          Generate Studio
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--dim)" }}>
          ครบวงจร — เลือกสินค้า → AI วิเคราะห์ → Script → เสียง → วิดีโอ
        </p>
      </div>

      {/* Steps progress */}
      <div style={{ display: "flex", gap: 0, marginBottom: 32, alignItems: "center" }}>
        {STEPS.map(({ id, label, icon: Icon }, i) => {
          const done    = i < curIdx;
          const current = i === curIdx;
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done ? "var(--teal)" : current ? "rgba(0,255,212,.15)" : "var(--glass)",
                  border: done ? "2px solid var(--teal)" : current ? "2px solid var(--teal)" : "2px solid var(--gb)",
                  boxShadow: current ? "0 0 20px rgba(0,255,212,.3)" : "none",
                  transition: "all .3s ease",
                }}>
                  {done
                    ? <CheckCircle2 size={16} color="#06060A" strokeWidth={2.5} />
                    : <Icon size={15} color={current ? "var(--teal)" : "var(--faint)"} strokeWidth={2} />
                  }
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: done ? "var(--teal)" : current ? "var(--text)" : "var(--faint)", whiteSpace: "nowrap" }}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2, margin: "0 6px", marginBottom: 18,
                  background: i < curIdx ? "var(--teal)" : "var(--gb)",
                  transition: "background .3s ease",
                }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>

        {/* Main panel */}
        <div>

          {/* Step: Select Product */}
          {step === "product" && (
            <div className="card">
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>เลือกสินค้า</h2>
              <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--dim)" }}>เลือกสินค้าที่ต้องการสร้างวิดีโอโปรโมท</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
                {products.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProduct(p)}
                    style={{
                      padding: 14, borderRadius: 14, cursor: "pointer",
                      border: `2px solid ${selectedProduct?.id === p.id ? "var(--teal)" : "var(--gb)"}`,
                      background: selectedProduct?.id === p.id ? "rgba(0,255,212,.06)" : "var(--glass)",
                      transition: "var(--tr)",
                      boxShadow: selectedProduct?.id === p.id ? "0 0 20px rgba(0,255,212,.12)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, overflow: "hidden", flexShrink: 0,
                        background: "rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {p.media_urls?.length > 0
                          ? <img src={p.media_urls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <Package size={18} color="var(--faint)" />
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </p>
                        {p.category && <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--faint)" }}>{p.category}</p>}
                      </div>
                      {selectedProduct?.id === p.id && <CheckCircle2 size={16} color="var(--teal)" />}
                    </div>
                  </div>
                ))}
              </div>
              {products.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--faint)" }}>
                  <Package size={32} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", opacity: .3 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>ยังไม่มีสินค้า — ไปเพิ่มสินค้าก่อน</p>
                </div>
              )}
            </div>
          )}

          {/* Step: Analyze */}
          {step === "analyze" && (
            <div className="card">
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>วิเคราะห์สินค้าด้วย AI</h2>
              <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--dim)" }}>
                Groq llama-3.3-70b จะวิเคราะห์ข้อมูลสินค้า <b style={{ color: "var(--text)" }}>{selectedProduct?.name}</b> เพื่อหาจุดขายและกลุ่มเป้าหมาย
              </p>
              {analysis && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(Object.entries(analysis) as [string, unknown][])
                    .filter(([k]) => !["analysis_id", "product_id"].includes(k))
                    .map(([k, v]) => (
                      <div key={k} style={{ padding: "12px 14px", background: "var(--glass)", borderRadius: 12, border: "1px solid var(--gb)" }}>
                        <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>{k}</p>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>
                          {Array.isArray(v) ? (v as string[]).join(" · ") : String(v)}
                        </p>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          )}

          {/* Step: Script */}
          {step === "script" && (
            <div className="card">
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Script Settings</h2>
              <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--dim)" }}>ปรับแต่งโทนและ CTA ก่อนสร้าง Script</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>โทนเสียง (Tone of Voice)</label>
                  <input className="cs-input" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="เช่น สนุก, กระชับ, น่าเชื่อถือ" />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>Call to Action</label>
                  <input className="cs-input" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="เช่น สั่งซื้อเลย, ลองฟรีวันนี้" />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>ความยาววิดีโอ (วินาที)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[15, 30, 60].map((d) => (
                      <button
                        key={d}
                        className={`btn btn-sm ${duration === d ? "btn-soft" : "btn-ghost"}`}
                        onClick={() => setDuration(d)}
                      >{d}s</button>
                    ))}
                  </div>
                </div>
              </div>
              {script && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--teal)" }}>Script Version {script.version}</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="icon-btn" onClick={() => navigator.clipboard.writeText(script.full_script || "")} title="คัดลอก"><Copy size={12} /></button>
                    </div>
                  </div>
                  {script.hook && (
                    <div style={{ padding: "12px 14px", background: "rgba(0,255,212,.06)", border: "1px solid rgba(0,255,212,.18)", borderRadius: 12, marginBottom: 10 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 10.5, fontWeight: 700, color: "var(--teal)" }}>HOOK</p>
                      <p style={{ margin: 0, fontSize: 13.5, color: "var(--text)", lineHeight: 1.7 }}>{script.hook}</p>
                    </div>
                  )}
                  {script.body && (
                    <div style={{ padding: "12px 14px", background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 12, marginBottom: 10 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 10.5, fontWeight: 700, color: "var(--dim)" }}>BODY</p>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>{script.body}</p>
                    </div>
                  )}
                  {script.cta && (
                    <div style={{ padding: "12px 14px", background: "rgba(77,127,255,.06)", border: "1px solid rgba(77,127,255,.18)", borderRadius: 12 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 10.5, fontWeight: 700, color: "var(--blue)" }}>CTA</p>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>{script.cta}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step: Voice */}
          {step === "voice" && (
            <div className="card">
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>เสียงพากย์ (TTS)</h2>
              <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--dim)" }}>สร้างไฟล์เสียงด้วย Google TTS (ภาษาไทย)</p>
              <div style={{ padding: "16px", background: "var(--glass)", borderRadius: 12, border: "1px solid var(--gb)", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(34,212,153,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Mic2 size={18} color="var(--ok)" />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Google TTS — ภาษาไทย</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--faint)" }}>ฟรี · ไม่จำกัดตัวอักษร · คุณภาพดี</p>
                  </div>
                  <span className="tag tag-ok" style={{ marginLeft: "auto" }}>พร้อมใช้</span>
                </div>
              </div>
              {voiceUrl && (
                <div style={{ padding: "14px 16px", background: "rgba(0,255,212,.06)", border: "1px solid rgba(0,255,212,.2)", borderRadius: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="voice-dot" />
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--ok)" }}>สร้างเสียงสำเร็จ</p>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{voiceUrl}</p>
                </div>
              )}
            </div>
          )}

          {/* Step: Render */}
          {step === "render" && (
            <div className="card">
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>เรนเดอร์วิดีโอ</h2>
              <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--dim)" }}>FFmpeg จะรวมภาพสินค้า + เสียงพากย์ → MP4 (9:16, 1080×1920)</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Resolution", val: "1080×1920" },
                  { label: "Format",     val: "MP4 (H.264)" },
                  { label: "Ratio",      val: "9:16 (TikTok)" },
                  { label: "Duration",   val: `${duration}s` },
                ].map(({ label, val }) => (
                  <div key={label} style={{ padding: "10px 14px", background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 10 }}>
                    <p style={{ margin: "0 0 3px", fontSize: 10.5, color: "var(--faint)", fontWeight: 700 }}>{label}</p>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(0,255,212,.12)", border: "2px solid var(--teal)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 0 40px rgba(0,255,212,.2)" }}>
                <CheckCircle2 size={28} color="var(--teal)" />
              </div>
              <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "var(--text)" }}>สร้างวิดีโอสำเร็จ!</h2>
              <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>วิดีโออยู่ใน Render Queue พร้อมสำหรับการอนุมัติและโพสต์</p>
              {renderUrl && (
                <div style={{ padding: "14px 16px", background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 12, marginBottom: 20, textAlign: "left" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 11.5, fontWeight: 700, color: "var(--dim)" }}>วิดีโอ URL</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{renderUrl}</p>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn btn-ghost" onClick={reset}><RotateCcw size={14} />สร้างใหม่</button>
                <a href="/render-queue">
                  <button className="btn btn-primary"><Play size={14} />ดูใน Queue</button>
                </a>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ margin: "16px 0 0", padding: "12px 16px", background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.2)", borderRadius: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--err)", fontWeight: 600 }}>⚠ {error}</p>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Video canvas preview */}
          <div className="gs-canvas" style={{ minHeight: 320 }}>
            <div className="gs-canvas-bg" />
            {/* Animated border lights */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: 16, pointerEvents: "none",
              background: "transparent",
              boxShadow: step === "done"
                ? "inset 0 0 0 2px var(--teal), 0 0 30px rgba(0,255,212,.25)"
                : "inset 0 0 0 1px var(--gb)",
            }}>
              {/* Running light border */}
              <div style={{
                position: "absolute", inset: 0, borderRadius: 16, overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0, height: 2,
                  background: `linear-gradient(90deg, transparent, ${step === "render" || step === "done" ? "var(--teal)" : "rgba(77,127,255,.5)"}, transparent)`,
                  animation: busy ? "scanX 1.5s ease-in-out infinite" : "scanX 3s ease-in-out infinite",
                }} />
                <div style={{
                  position: "absolute",
                  bottom: 0, left: 0, right: 0, height: 2,
                  background: "linear-gradient(90deg, transparent, var(--purple), transparent)",
                  animation: busy ? "scanX 1.5s ease-in-out infinite reverse" : "scanX 3s ease-in-out infinite reverse",
                }} />
                <div style={{
                  position: "absolute",
                  left: 0, top: 0, bottom: 0, width: 2,
                  background: "linear-gradient(180deg, transparent, var(--blue), transparent)",
                  animation: "scanY 2.5s ease-in-out infinite",
                }} />
                <div style={{
                  position: "absolute",
                  right: 0, top: 0, bottom: 0, width: 2,
                  background: "linear-gradient(180deg, transparent, var(--teal), transparent)",
                  animation: "scanY 2.5s ease-in-out infinite reverse",
                }} />
              </div>
            </div>

            {step === "done" && renderUrl ? (
              <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,255,212,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", boxShadow: "0 0 30px rgba(0,255,212,.3)" }}>
                  <Film size={24} color="var(--teal)" />
                </div>
                <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--teal)" }}>วิดีโอพร้อมแล้ว</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>MP4 · 1080×1920 · {duration}s</p>
              </div>
            ) : busy ? (
              <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                <Loader2 size={32} color="var(--teal)" style={{ animation: "spin 1s linear infinite", display: "block", margin: "0 auto 12px" }} />
                <p style={{ margin: 0, fontSize: 13, color: "var(--dim)" }}>กำลังประมวลผล…</p>
              </div>
            ) : (
              <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                {selectedProduct?.media_urls?.[0] ? (
                  <img src={selectedProduct.media_urls[0]} alt="" style={{ width: 120, height: 160, objectFit: "cover", borderRadius: 12, marginBottom: 12, boxShadow: "0 8px 30px rgba(0,0,0,.5)" }} />
                ) : (
                  <div style={{ width: 90, height: 120, background: "rgba(255,255,255,.04)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                    <Film size={28} color="var(--faint)" />
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 12, color: "var(--faint)" }}>
                  {selectedProduct ? selectedProduct.name : "เลือกสินค้าเพื่อเริ่ม"}
                </p>
              </div>
            )}

            {/* Voice badge */}
            {(step === "voice" || step === "render" || step === "done") && (
              <div className="voice-badge">
                <span className="voice-dot" />
                TH · Google TTS
              </div>
            )}
          </div>

          {/* Action button */}
          {step !== "done" ? (
            <button
              className="gen-btn"
              onClick={runStep}
              disabled={busy || (step === "product" && !selectedProduct)}
              style={{ width: "100%", opacity: (busy || (step === "product" && !selectedProduct)) ? .5 : 1 }}
            >
              {busy
                ? <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> กำลังทำงาน…</span>
                : <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>{btnLabel[step]} <ChevronRight size={16} /></span>
              }
            </button>
          ) : (
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={reset}>
              <RotateCcw size={14} /> สร้างใหม่อีกครั้ง
            </button>
          )}

          {/* Pipeline info */}
          <div className="card" style={{ padding: 16 }}>
            <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "var(--dim)" }}>ข้อมูล Job</p>
            {[
              { label: "สินค้า",   val: selectedProduct?.name || "—" },
              { label: "Job ID",   val: job ? job.id.slice(0, 8) + "…" : "—" },
              { label: "Duration", val: `${duration}s` },
              { label: "Platform", val: "TikTok · 9:16" },
            ].map(({ label, val }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--gb)" }}>
                <span style={{ fontSize: 12, color: "var(--faint)" }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CSS for light animations */}
      <style>{`
        @keyframes scanX {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes scanY {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%,100% { opacity: .6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
