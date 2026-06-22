"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, fileUrl } from "@/lib/api";
import { ChevronDown, Film, Image, Layers, Pen, Loader2, Download, RefreshCw, X, Sparkles, ImagePlus, CheckCircle2, Play, ArrowRight } from "lucide-react";
import { useDropzone } from "react-dropzone";

interface Product { id: string; name: string; media_urls: string[]; }

const TEMPLATES = [
  { id: "friend",   emoji: "🤝", label: "รีวิวเพื่อนสนิท",      desc: "เสียงเป็นกันเอง · สบายๆ · เหมาะสกินแคร์/ของใช้",  tone: "สนุก กระชับ เป็นกันเอง เหมือนเพื่อนแนะนำ",              cta: "ลองดูได้เลย" },
  { id: "luxury",   emoji: "✨", label: "ลักชัวรี่ซีเนมาติก",   desc: "หรู · พรีเมียม · เน้นคุณค่าและความพิเศษ",           tone: "หรู พรีเมียม มีระดับ ซีเนมาติก บรรยายละเอียด",           cta: "สัมผัสความพิเศษ" },
  { id: "promo",    emoji: "🔥", label: "โปรโมชั่นเร่งด่วน",    desc: "เร่งด่วน · มีส่วนลด · กระตุ้นการซื้อสูง",          tone: "เร่งด่วน กระตุ้น โปรโมชั่น มีเวลาจำกัด ลด",             cta: "สั่งเลยวันนี้" },
  { id: "unbox",    emoji: "📦", label: "มีมเปิดกล่อง",          desc: "สนุก · UGC · สไตล์ถ่ายเอง ดูเป็นธรรมชาติ",         tone: "ตลก สนุก UGC เป็นธรรมชาติ ไม่ขัดเกลา",                 cta: "ลิงก์ใน bio" },
  { id: "pro",      emoji: "💼", label: "รีวิวมืออาชีพ",         desc: "หนักแน่น · มีข้อมูล · น่าเชื่อถือสูง",             tone: "มืออาชีพ หนักแน่น ข้อมูลชัดเจน เปรียบเทียบตัวเลข",     cta: "เปรียบเทียบแล้วซื้อ" },
  { id: "funny",    emoji: "😂", label: "ตลก / เฮฮา",           desc: "ขำขัน · เซอร์ไพรส์ · ดูแล้วอยากแชร์",              tone: "ตลก เฮฮา ขำขัน เซอร์ไพรส์ มุกแบบไม่คาดฝัน ไวรัล",      cta: "แชร์ให้เพื่อนด้วย" },
  { id: "comedy",   emoji: "🤣", label: "ขำขัน มีม",             desc: "มีมสไตล์ · ประโยคติดหู · เทรนด์โซเชียล",           tone: "มีม ประโยคติดหู เทรนด์โซเชียล Gen Z สนุก",               cta: "ดูแล้วฉีดยา" },
  { id: "serious",  emoji: "🎯", label: "ซีเรียส / จริงจัง",    desc: "น้ำเสียงหนักแน่น · ตรงประเด็น · ไม่มีตลก",         tone: "ซีเรียส จริงจัง หนักแน่น พูดตรงๆ ไม่อ้อมค้อม",         cta: "ตัดสินใจเลย" },
  { id: "lifestyle",emoji: "🌟", label: "ไลฟ์สไตล์",             desc: "แบรนด์คนรุ่นใหม่ · อารมณ์ดี · Aesthetic",           tone: "ไลฟ์สไตล์ aesthetic อารมณ์ดี minimalist คนรุ่นใหม่",    cta: "เป็นส่วนหนึ่งของ lifestyle นี้" },
  { id: "compare",  emoji: "⚖️", label: "เปรียบเทียบ",           desc: "เทียบสินค้า · ก่อน-หลัง · ข้อดีข้อเสีย",           tone: "เปรียบเทียบ ข้อมูล ก่อนหลัง ข้อดีข้อเสีย ตัวเลขชัดเจน", cta: "เลือกแบบฉลาด" },
  { id: "before",   emoji: "🔄", label: "ก่อน–หลัง ใช้งาน",      desc: "Transformation · ผลลัพธ์จริง · ดูน่าเชื่อถือ",      tone: "ก่อนหลัง transformation ผลลัพธ์จริง น่าเชื่อถือ",        cta: "ลองเปลี่ยนตัวเองดู" },
  { id: "travel",   emoji: "✈️", label: "ท่องเที่ยว / Vlog",     desc: "บรรยากาศ · ความสวยงาม · เชิญชวนมาเที่ยว",         tone: "ท่องเที่ยว Vlog บรรยากาศดี เชิญชวน ผ่อนคลาย",           cta: "จองเลยก่อนเต็ม" },
];

const TABS = [
  { id: "video",   label: "สร้างวิดีโอ",           Icon: Film },
  { id: "image",   label: "สร้างภาพ",              Icon: Image },
  { id: "img2vid", label: "รูปนิ่ง → วิดีโอ",     Icon: Layers },
  { id: "sketch",  label: "สเก็ตช์ → ภาพ/วิดีโอ", Icon: Pen },
];

const STEPS = [
  "AI วิเคราะห์สินค้า...",
  "สร้าง Script...",
  "สร้างเสียงพากย์...",
  "เรนเดอร์วิดีโอ...",
];

const VER_LABELS = ["A", "B", "C", "D", "E"];

type Status = "idle" | "running" | "done" | "error";

export default function GeneratePage() {
  const router = useRouter();

  const [tab, setTab]                  = useState("video");
  const [tpl, setTpl]                  = useState(TEMPLATES[0]);
  const [showTplModal, setShowTplModal] = useState(false);
  const [concept, setConcept]          = useState("");
  const [multiVer, setMultiVer]        = useState(false);
  const [verCount, setVerCount]        = useState(3);
  const [resolution, setResolution]    = useState("1080p·30s");
  const [voice, setVoice]              = useState("เป็นกันเอง (หญิง)");

  const [products, setProducts]        = useState<Product[]>([]);
  const [product, setProduct]          = useState<Product | null>(null);
  const [showPicker, setShowPicker]    = useState(false);

  const [status, setStatus]    = useState<Status>("idle");
  const [step, setStep]        = useState(0);
  const [errMsg, setErrMsg]    = useState("");
  const [results, setResults]  = useState<Record<string, string>>({});
  const [activeVer, setActiveVer] = useState("A");
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed]    = useState(0);

  const [refImgFile, setRefImgFile]   = useState<File | null>(null);
  const [refImgUrl, setRefImgUrl]     = useState("");

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {});
  }, []);

  const onRefDrop = useCallback((files: File[]) => {
    const f = files[0]; if (!f) return;
    if (refImgUrl) URL.revokeObjectURL(refImgUrl);
    setRefImgFile(f); setRefImgUrl(URL.createObjectURL(f));
  }, [refImgUrl]);
  const { getRootProps: refRoot, getInputProps: refInput, isDragActive: refDrag } = useDropzone({
    onDrop: onRefDrop, accept: { "image/*": [] }, maxFiles: 1, maxSize: 10 * 1024 * 1024,
  });
  const clearRef = () => {
    setRefImgFile(null); if (refImgUrl) { URL.revokeObjectURL(refImgUrl); setRefImgUrl(""); }
  };

  const durSec = parseInt(resolution.split("·")[1]) || 30;

  const TONE_VARIANTS = [
    tpl.tone,
    `${tpl.tone} — สั้นกระชับ ตรงประเด็น ไม่อ้อมค้อม พูดน้อยแต่โดน`,
    `${tpl.tone} — ใช้ตัวเลขและข้อมูล เน้นข้อเท็จจริง เปรียบเทียบราคา/ผลลัพธ์`,
    `${tpl.tone} — storytelling เปิดด้วยปัญหาของคน เดินเรื่อง แล้วค่อยนำเสนอสินค้า`,
    `${tpl.tone} — hook แปลกใหม่ เซอร์ไพรส์ ทำให้คนหยุดดู ไม่เหมือนโฆษณาทั่วไป`,
  ];

  const runOne = async (vLabel: string, toneVariant: string) => {
    if (!product) return "";

    setStep(0);
    const jobRes = await api.post("/jobs/", { product_id: product.id, platform: "tiktok" });
    const jobId = jobRes.data.id;

    try { await api.post(`/products/${product.id}/analyze`); } catch { /* already analyzed */ }

    setStep(1);
    await api.post(`/jobs/${jobId}/generate-script`, null, {
      params: { tone_of_voice: toneVariant, cta_style: tpl.cta, duration_sec: durSec, concept },
    });

    setStep(2);
    const voiceRes = await api.post(`/jobs/${jobId}/voiceover`, null, {
      params: { voice_style: voice },
    });

    setStep(3);
    const renderRes = await api.post(`/jobs/${jobId}/render`, null, {
      params: { voiceover_url: voiceRes.data.voiceover_url, duration_sec: durSec },
    });

    return renderRes.data.video_url || "";
  };

  const handleGenerate = async () => {
    if (!product) { setShowPicker(true); return; }
    setStatus("running");
    setResults({});
    setErrMsg("");
    setActiveVer("A");
    setStartTime(Date.now());

    try {
      const count = multiVer ? verCount : 1;
      const acc: Record<string, string> = {};
      for (let i = 0; i < count; i++) {
        const url = await runOne(VER_LABELS[i], TONE_VARIANTS[i]);
        acc[VER_LABELS[i]] = url;
        setResults({ ...acc });
      }
      setElapsed(Math.round((Date.now() - startTime) / 1000));
      setStatus("done");
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
      setStatus("error");
    }
  };

  const reset = () => { setStatus("idle"); setResults({}); setErrMsg(""); };
  const activeUrl = results[activeVer] || "";

  return (
    <div className="page-enter" style={{ padding: "28px 40px", maxWidth: 1100, margin: "0 auto" }}>

      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        กลุ่ม 2 · AI สร้างคอนเทนต์
      </p>

      {/* Top tabs */}
      <div style={{ display: "flex", gap: 26, marginBottom: 18, borderBottom: "1px solid var(--gb)" }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13.5, fontWeight: tab === id ? 800 : 600,
            color: tab === id ? "var(--text)" : "var(--faint)",
            paddingBottom: 14, marginBottom: -1,
            borderBottom: `2px solid ${tab === id ? "var(--teal)" : "transparent"}`,
            display: "flex", alignItems: "center", gap: 7, transition: "all .15s",
          }}>
            <Icon size={14} strokeWidth={2} />{label}
          </button>
        ))}
      </div>

      {/* Template bar */}
      <div onClick={() => setShowTplModal(true)} style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 13,
        padding: "11px 16px", marginBottom: 16, cursor: "pointer",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: "linear-gradient(135deg,var(--teal),var(--blue))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 900, color: "#06060A",
        }}>AI</div>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 12.5 }}>{tpl.emoji} เทมเพลต {tpl.label}</b>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 1 }}>{tpl.desc}</div>
        </div>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>เปลี่ยน</span>
        <ChevronDown size={13} color="var(--faint)" />
      </div>

      {/* Body */}
      <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>

        {/* Left */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{
            background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14,
            padding: 18, flex: 1, display: "flex", flexDirection: "column", gap: 10,
          }}>

            {/* Product selector */}
            <div onClick={() => setShowPicker(v => !v)} style={{
              background: "var(--bg)", border: `1px solid ${product ? "rgba(0,255,212,.3)" : "var(--gb)"}`,
              borderRadius: 10, padding: "9px 14px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 13, color: product ? "var(--text)" : "var(--faint)",
            }}>
              <span>{product ? `📦 ${product.name}` : "เลือกสินค้า..."}</span>
              <ChevronDown size={13} />
            </div>

            {showPicker && (
              <div style={{
                background: "var(--surface)", border: "1px solid var(--gb)",
                borderRadius: 10, overflow: "hidden", maxHeight: 160, overflowY: "auto",
              }}>
                {products.length === 0 ? (
                  <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--faint)" }}>
                    ยังไม่มีสินค้า —{" "}
                    <span onClick={() => router.push("/products")} style={{ color: "var(--teal)", cursor: "pointer" }}>
                      อัปโหลดสินค้าก่อน
                    </span>
                  </div>
                ) : products.map(p => (
                  <div key={p.id} onClick={() => { setProduct(p); setShowPicker(false); }} style={{
                    padding: "10px 14px", cursor: "pointer", fontSize: 13,
                    background: product?.id === p.id ? "rgba(0,255,212,.06)" : "transparent",
                    color: product?.id === p.id ? "var(--teal)" : "var(--text)",
                    borderBottom: "1px solid var(--gb)",
                  }}>{p.name}</div>
                ))}
              </div>
            )}

            {/* Reference image */}
            {refImgUrl ? (
              <div style={{ position: "relative", borderRadius: 11, overflow: "hidden" }}>
                <img src={refImgUrl} alt="ref" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 11, border: "1px solid rgba(0,255,212,.2)", display: "block" }} />
                <button onClick={clearRef} style={{
                  position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 6,
                  background: "rgba(0,0,0,.7)", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <X size={11} color="var(--text)" />
                </button>
                <p style={{ margin: "5px 0 0", fontSize: 10.5, color: "var(--ok)", fontWeight: 700 }}>✓ {refImgFile?.name}</p>
              </div>
            ) : (
              <div {...refRoot()} style={{
                border: `1.5px dashed ${refDrag ? "rgba(0,255,212,.5)" : "var(--gb)"}`,
                borderRadius: 11, padding: "16px 12px",
                textAlign: "center", cursor: "pointer",
                background: refDrag ? "rgba(0,255,212,.04)" : "rgba(255,255,255,.01)",
                transition: "all .15s",
              }}>
                <input {...refInput()} />
                <ImagePlus size={18} color="var(--faint)" style={{ margin: "0 auto 7px", display: "block", opacity: .5 }} />
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--faint)", fontWeight: 600 }}>{refDrag ? "วางรูปที่นี่…" : "เพิ่มรูปสินค้าอ้างอิง"}</p>
                <p style={{ margin: "3px 0 0", fontSize: 10.5, color: "var(--faint)", opacity: .7 }}>ไม่บังคับ · PNG, JPG สูงสุด 10MB</p>
              </div>
            )}

            {/* Hint */}
            <p style={{ margin: 0, fontSize: 11, color: "var(--teal)", lineHeight: 1.6, opacity: .85 }}>
              ใช้เครื่องหมายคำพูดสำหรับบทพูด เช่น พูดว่า &quot;เซรั่มตัวนี้ใช้มา 2 อาทิตย์&quot; รองรับหลายภาษาและสำเนียง
            </p>

            {/* Concept */}
            <textarea value={concept} onChange={e => setConcept(e.target.value)}
              placeholder={`อธิบายคลิปที่อยากได้ เช่น "รีวิว${tpl.label}โทนสบายๆ เน้นจุดเด่นสินค้า"`}
              style={{
                flex: 1, width: "100%", background: "transparent", border: "none",
                color: "var(--text)", fontSize: 13, lineHeight: 1.7, resize: "none",
                outline: "none", minHeight: 90, fontFamily: "inherit",
              }}
            />

            {/* Multi-version */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              borderTop: "1px solid var(--gb)", paddingTop: 12, marginTop: "auto",
            }}>
              <div onClick={() => setMultiVer(v => !v)} style={{
                width: 34, height: 19, borderRadius: 10, flexShrink: 0, cursor: "pointer", position: "relative",
                background: multiVer ? "linear-gradient(90deg,var(--teal),var(--blue))" : "var(--glass2)",
                transition: "background .2s", boxShadow: multiVer ? "0 0 10px rgba(0,255,212,.25)" : "none",
              }}>
                <div style={{
                  position: "absolute", top: 2, width: 15, height: 15, borderRadius: "50%",
                  left: multiVer ? "auto" : 2, right: multiVer ? 2 : "auto",
                  background: multiVer ? "#06060A" : "var(--faint)", transition: "all .2s",
                }} />
              </div>
              <span style={{ fontSize: 11.5, color: "var(--dim)", fontWeight: 600 }}>สร้างหลายเวอร์ชัน</span>
              {multiVer && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                  {[2, 3, 5].map(n => (
                    <button key={n} onClick={() => setVerCount(n)} style={{
                      padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${verCount === n ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
                      background: verCount === n ? "rgba(0,255,212,.15)" : "transparent",
                      color: verCount === n ? "var(--teal)" : "var(--faint)",
                    }}>{n}</button>
                  ))}
                  <span style={{ fontSize: 10.5, color: "var(--teal)", fontWeight: 700, marginLeft: 2 }}>
                    เวอร์ชัน ({VER_LABELS.slice(0, verCount).join("–")}) ›
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div style={{
          position: "relative", flex: 1,
          background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", minHeight: 420, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(60% 60% at 70% 20%,rgba(0,255,212,.06),transparent),radial-gradient(50% 50% at 30% 80%,rgba(77,127,255,.06),transparent)" }} />

          {/* Voice badge */}
          <div style={{
            position: "absolute", top: 14, left: 14, zIndex: 2,
            background: "rgba(34,212,153,.1)", border: "1px solid rgba(34,212,153,.2)",
            borderRadius: 8, padding: "5px 11px", fontSize: 11, color: "var(--ok)",
            fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok)", display: "inline-block", animation: "vpulse 1.5s ease-in-out infinite" }} />
            🎙 {voice}
          </div>

          {/* Version tabs */}
          {status === "done" && Object.keys(results).length > 1 && (
            <div style={{ position: "absolute", top: 14, right: 14, zIndex: 2, display: "flex", gap: 4 }}>
              {Object.keys(results).map(v => (
                <button key={v} onClick={() => setActiveVer(v)} style={{
                  padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: "pointer",
                  border: `1px solid ${activeVer === v ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
                  background: activeVer === v ? "rgba(0,255,212,.15)" : "var(--glass)",
                  color: activeVer === v ? "var(--teal)" : "var(--faint)",
                }}>Ver. {v}</button>
              ))}
            </div>
          )}

          <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: 24, width: "100%" }}>

            {status === "idle" && (
              <>
                <div style={{ fontSize: 36, opacity: .35, marginBottom: 10 }}>🎬</div>
                <div style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 16 }}>พรีวิวคลิปจะแสดงตรงนี้หลังกดสร้าง</div>
                <button onClick={() => router.push("/render-queue")} style={{
                  background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--text)",
                  padding: "9px 18px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                }}>ดูเทมเพลตที่เคยใช้ →</button>
              </>
            )}

            {status === "running" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ position: "relative", width: 64, height: 64 }}>
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(0,255,212,.15)" }} />
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "var(--teal)", animation: "spin 1s linear infinite" }} />
                  <Sparkles size={22} color="var(--teal)" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{STEPS[step]}</div>
                  {multiVer && <div style={{ fontSize: 12, color: "var(--faint)" }}>เวอร์ชัน {Object.keys(results).length + 1} / {verCount}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {STEPS.map((_, i) => (
                    <div key={i} style={{
                      width: 50, height: 3, borderRadius: 2,
                      background: i < step ? "var(--teal)" : i === step ? "rgba(0,255,212,.5)" : "rgba(255,255,255,.1)",
                      transition: "background .3s",
                    }} />
                  ))}
                </div>
              </div>
            )}

            {status === "done" && (
              <div style={{ width: "100%", maxWidth: 360, margin: "0 auto" }}>
                {activeUrl ? (
                  /* ── มีวิดีโอ: แสดง player พร้อม success bar ── */
                  <>
                    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", boxShadow: "0 0 40px rgba(0,255,212,.2)" }}>
                      <video src={fileUrl(activeUrl)} controls style={{ width: "100%", aspectRatio: "9/16", background: "#000", display: "block", maxHeight: "58vh" }} />
                      {/* success badge */}
                      <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 6, background: "rgba(6,6,10,.75)", backdropFilter: "blur(8px)", border: "1px solid rgba(34,212,153,.35)", borderRadius: 10, padding: "6px 12px" }}>
                        <CheckCircle2 size={13} color="var(--ok)" />
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--ok)" }}>สร้างสำเร็จ!</span>
                        {elapsed > 0 && <span style={{ fontSize: 10.5, color: "var(--faint)" }}>{elapsed}s</span>}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                      <a href={fileUrl(activeUrl)} download style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        padding: "10px 8px", borderRadius: 11, background: "var(--glass)", border: "1px solid var(--gb)",
                        color: "var(--faint)", textDecoration: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      }}><Download size={15} color="var(--teal)" />ดาวน์โหลด</a>
                      <button onClick={() => router.push("/preview")} style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        padding: "10px 8px", borderRadius: 11, cursor: "pointer",
                        background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.25)",
                        color: "var(--teal)", fontSize: 11, fontWeight: 700,
                      }}><Play size={15} fill="var(--teal)" />พรีวิวทั้งหมด</button>
                      <button onClick={reset} style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        padding: "10px 8px", borderRadius: 11, cursor: "pointer",
                        background: "var(--glass)", border: "1px solid var(--gb)",
                        color: "var(--faint)", fontSize: 11, fontWeight: 700,
                      }}><RefreshCw size={15} />สร้างใหม่</button>
                    </div>
                  </>
                ) : (
                  /* ── ไม่มี URL: success card + ปุ่มไป Preview ── */
                  <div style={{ textAlign: "center" }}>
                    {/* Glow ring */}
                    <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto 24px" }}>
                      <div style={{
                        position: "absolute", inset: -6, borderRadius: "50%",
                        background: "conic-gradient(var(--teal), var(--blue), var(--purple), var(--teal))",
                        animation: "spin 3s linear infinite", opacity: .6,
                      }} />
                      <div style={{
                        position: "absolute", inset: -3, borderRadius: "50%", background: "var(--surface)",
                      }} />
                      <div style={{
                        position: "absolute", inset: 0, borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(0,255,212,.15) 0%, transparent 70%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <CheckCircle2 size={40} color="var(--ok)" strokeWidth={1.5} />
                      </div>
                    </div>

                    <p style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, background: "linear-gradient(90deg,var(--teal),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                      สร้างสำเร็จ!
                    </p>
                    <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--dim)" }}>
                      {product?.name || "วิดีโอ"} · เทมเพลต {tpl.label}
                    </p>
                    {elapsed > 0 && (
                      <p style={{ margin: "0 0 24px", fontSize: 11.5, color: "var(--faint)" }}>
                        ใช้เวลา {elapsed >= 60 ? `${Math.floor(elapsed/60)} นาที ${elapsed%60} วิ` : `${elapsed} วินาที`}
                      </p>
                    )}

                    {/* Stats pills */}
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                      {[
                        { label: "AI Script", val: "✓" },
                        { label: "Voiceover", val: "✓" },
                        { label: "FFmpeg Render", val: "✓" },
                      ].map(s => (
                        <div key={s.label} style={{ padding: "5px 12px", borderRadius: 20, background: "rgba(34,212,153,.08)", border: "1px solid rgba(34,212,153,.2)", fontSize: 11, color: "var(--ok)", fontWeight: 700 }}>
                          {s.val} {s.label}
                        </div>
                      ))}
                    </div>

                    {/* CTA buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <button onClick={() => router.push("/preview")} style={{
                        width: "100%", padding: "14px 20px", borderRadius: 13, cursor: "pointer",
                        background: "linear-gradient(90deg,var(--teal),var(--blue))",
                        border: "none", color: "#06060A", fontSize: 14, fontWeight: 900,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        boxShadow: "0 6px 24px rgba(0,255,212,.3)",
                      }}>
                        <Play size={16} fill="#06060A" /> ดูวิดีโอใน Preview
                        <ArrowRight size={14} />
                      </button>
                      <button onClick={() => router.push("/approval")} style={{
                        width: "100%", padding: "11px 20px", borderRadius: 13, cursor: "pointer",
                        background: "rgba(77,127,255,.08)", border: "1px solid rgba(77,127,255,.25)",
                        color: "var(--blue)", fontSize: 13, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      }}>
                        ไปหน้าอนุมัติ <ArrowRight size={13} />
                      </button>
                      <button onClick={reset} style={{
                        width: "100%", padding: "10px 20px", borderRadius: 13, cursor: "pointer",
                        background: "transparent", border: "1px solid var(--gb)",
                        color: "var(--faint)", fontSize: 12, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}>
                        <RefreshCw size={12} /> สร้างวิดีโอใหม่
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {status === "error" && (
              <div>
                <div style={{ fontSize: 30, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontSize: 13, color: "var(--err)", marginBottom: 12, maxWidth: 280 }}>{errMsg}</div>
                <button onClick={reset} style={{
                  padding: "8px 20px", borderRadius: 9, cursor: "pointer",
                  background: "rgba(255,77,106,.1)", border: "1px solid rgba(255,77,106,.2)",
                  color: "var(--err)", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6,
                }}><RefreshCw size={12} /> ลองใหม่</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
        <div style={{ position: "relative" }}>
          <select value={resolution} onChange={e => setResolution(e.target.value)} className="cs-select">
            <option value="720p·15s">720p · 15s · 9:16</option>
            <option value="1080p·30s">1080p · 30s · 9:16</option>
            <option value="1080p·60s">1080p · 60s · 9:16</option>
          </select>
          <ChevronDown size={12} color="var(--faint)" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        </div>

        <div style={{ position: "relative" }}>
          <select value={voice} onChange={e => setVoice(e.target.value)} className="cs-select">
            <option>เป็นกันเอง (หญิง)</option>
            <option>มืออาชีพ (ชาย)</option>
            <option>สดใส (หญิง)</option>
            <option>หนักแน่น (ชาย)</option>
          </select>
          <ChevronDown size={12} color="var(--faint)" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        </div>

        <button onClick={handleGenerate} disabled={status === "running"} style={{
          marginLeft: "auto",
          background: status === "running" ? "var(--glass2)" : "linear-gradient(90deg,#22D499,#00FFD4,#4D7FFF)",
          backgroundSize: "200% 200%",
          color: status === "running" ? "var(--faint)" : "#06060A",
          border: "none", padding: "12px 40px", borderRadius: 12,
          fontSize: 14, fontWeight: 900,
          cursor: status === "running" ? "not-allowed" : "pointer",
          boxShadow: status === "running" ? "none" : "0 6px 20px rgba(34,212,153,.35)",
          display: "flex", alignItems: "center", gap: 8,
          animation: status !== "running" ? "gbg 3s ease infinite" : "none",
          transition: "all .2s",
        }}>
          {status === "running"
            ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> กำลังสร้าง...</>
            : <><Sparkles size={15} /> Generate</>}
        </button>
      </div>

      <p style={{ fontSize: 12, color: "var(--faint)", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.04)", lineHeight: 1.6 }}>
        เลือกเสียงเร็วๆ ได้ตรงนี้ — ถ้าจะตั้งค่าละเอียด (สำเนียง/อารมณ์/บันทึกเสียงใหม่) ไปที่{" "}
        <span onClick={() => router.push("/caption")} style={{ color: "var(--teal)", cursor: "pointer", fontWeight: 700 }}>
          06 Caption · Hashtag · เสียง
        </span>
      </p>

      {/* Template Modal */}
      {showTplModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,.72)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => setShowTplModal(false)}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--gb)",
            borderRadius: 20, padding: 28, width: "100%", maxWidth: 720,
            maxHeight: "85vh", display: "flex", flexDirection: "column",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>เลือกเทมเพลต</h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--faint)" }}>{TEMPLATES.length} สไตล์ · คลิกเพื่อเลือก</p>
              </div>
              <button onClick={() => setShowTplModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)" }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {TEMPLATES.map(t => (
                  <div key={t.id} onClick={() => { setTpl(t); setShowTplModal(false); }} style={{
                    padding: "14px 14px 12px", borderRadius: 13, cursor: "pointer",
                    border: `1.5px solid ${tpl.id === t.id ? "rgba(0,255,212,.5)" : "var(--gb)"}`,
                    background: tpl.id === t.id ? "rgba(0,255,212,.06)" : "var(--glass)",
                    transition: "all .12s",
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 7 }}>{t.emoji}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4, lineHeight: 1.3 }}>{t.label}</div>
                    <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5 }}>{t.desc}</div>
                    {tpl.id === t.id && (
                      <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--teal)", fontWeight: 700, background: "rgba(0,255,212,.1)", padding: "2px 8px", borderRadius: 5 }}>
                        ✓ กำลังใช้งาน
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes gbg { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes vpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.75)} }
      `}</style>
    </div>
  );
}
