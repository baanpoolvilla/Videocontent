"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, fileUrl } from "@/lib/api";
import {
  ChevronDown, Loader2, Download, RefreshCw, X, Sparkles, ImagePlus,
  CheckCircle2, Play, ArrowRight, ChevronRight, Video, Check,
} from "lucide-react";
import { useDropzone } from "react-dropzone";

interface Product { id: string; name: string; media_urls: string[]; }

// ── Visual Styles สำหรับ Image-to-Video ──────────────────────────────────────
const VIDEO_STYLES = [
  {
    id: "playful",
    label: "Playful Overlay",
    emoji: "🎨",
    desc: "ดูเด้ง · ลูกเล่น · สีสัน",
    color: "rgba(255,107,183,.12)",
    border: "rgba(255,107,183,.45)",
    glow: "rgba(255,107,183,.3)",
  },
  {
    id: "luxury",
    label: "Luxury Cinematic",
    emoji: "✨",
    desc: "หรูหรา · ซีเนมาติก · พรีเมียม",
    color: "rgba(255,176,46,.12)",
    border: "rgba(255,176,46,.45)",
    glow: "rgba(255,176,46,.3)",
  },
  {
    id: "party",
    label: "Party Vibes",
    emoji: "🎉",
    desc: "สนุก · ปาร์ตี้ · พลังงานสูง",
    color: "rgba(0,255,212,.12)",
    border: "rgba(0,255,212,.45)",
    glow: "rgba(0,255,212,.3)",
  },
  {
    id: "minimal",
    label: "Minimal Clean",
    emoji: "⬜",
    desc: "สะอาด · ตรงประเด็น · น้อยแต่มาก",
    color: "rgba(77,127,255,.12)",
    border: "rgba(77,127,255,.45)",
    glow: "rgba(77,127,255,.3)",
  },
];

// ── Content Templates ─────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: "pv_vibe",    emoji: "🏊", label: "Pool Villa Vibe",        desc: "บรรยากาศสระส่วนตัว · วิลล่าหรู · เชิญชวนมาพัก",   tone: "บรรยากาศ luxury pool villa สระส่วนตัว พัทยา เที่ยว Aesthetic ผ่อนคลาย สวยงาม",    cta: "จองเลยก่อนเต็ม" },
  { id: "pv_sunset",  emoji: "🌅", label: "Sunset Pool View",       desc: "วิวสระ · พระอาทิตย์ตก · อารมณ์ดีสุดๆ",           tone: "sunset วิวสวย ช่วงเวลาทอง pool villa พัทยา romantic มีสไตล์",                       cta: "มาสัมผัสด้วยตัวเอง" },
  { id: "pv_couple",  emoji: "💑", label: "Couple Retreat",         desc: "รีทรีทคู่รัก · โรแมนติก · วันพักผ่อน",           tone: "คู่รัก โรแมนติก พักผ่อน pool villa ส่วนตัว honeymoon anniversary วันหยุด",           cta: "พาคนพิเศษมาพัก" },
  { id: "pv_family",  emoji: "👨‍👩‍👧", label: "Family Getaway",       desc: "แพ็กเกจครอบครัว · เด็กสนุก · ปลอดภัย",           tone: "ครอบครัว เด็ก family getaway pool villa วันหยุด สนุก ความทรงจำ",                   cta: "พาครอบครัวมาพัก" },
  { id: "pv_promo",   emoji: "💰", label: "โปรราคาพิเศษ",           desc: "ราคาพิเศษ · จองด่วน · ห้องว่างจำกัด",            tone: "โปรโมชั่น ราคาพิเศษ ส่วนลด จองด่วน pool villa พัทยา ไม่ควรพลาด",                 cta: "จองเลยวันนี้ก่อนเต็ม" },
  { id: "pv_facility",emoji: "⭐", label: "Highlight สิ่งอำนวย",   desc: "ห้องพัก · ครัว · BBQ · WiFi · ที่จอดรถ",        tone: "สิ่งอำนวยความสะดวก ครบครัน ห้องพักหรู BBQ pool villa คุ้มค่า",                    cta: "ครบทุกอย่างที่ต้องการ" },
  { id: "pv_weekend", emoji: "🏖️", label: "Weekend Escape",         desc: "วีคเอนด์ · ออกจากเมือง · 2 ชม.จากกรุงเทพ",      tone: "weekend escape ใกล้กรุงเทพ พัทยา 2 ชั่วโมง ออกจากเมือง พักผ่อน pool villa",       cta: "เอสเคปวีคเอนด์นี้" },
  { id: "pv_ugc",     emoji: "📸", label: "รีวิวจากแขกจริง",        desc: "ประสบการณ์จริง · UGC · น่าเชื่อถือ",              tone: "รีวิวจริง แขก ประสบการณ์ UGC พักจริง pool villa พัทยา ไม่ปรุงแต่ง",               cta: "อ่านรีวิวเพิ่มเติมได้เลย" },
  { id: "pv_night",   emoji: "🌙", label: "Night Pool Vibes",       desc: "บรรยากาศกลางคืน · ไฟสระ · Mood & Aesthetic",     tone: "กลางคืน night pool ambient ไฟสระ บรรยากาศ aesthetic ส่วนตัว pool villa",           cta: "จองคืนนี้ยังทัน" },
  { id: "pv_intro",   emoji: "🎬", label: "แนะนำวิลล่า (Cinematic)", desc: "ซีเนมาติก · บรรยาย · โชว์ทุกมุม",                tone: "cinematic บรรยาย แนะนำ pool villa ทุกมุม หรูหรา ความพิเศษ Pattaya luxury",         cta: "ดูรายละเอียดเพิ่มเติม" },
  { id: "pv_compare", emoji: "🏆", label: "ทำไมต้องเลือกเรา",        desc: "เปรียบเทียบ · ข้อดี · คุ้มกว่าโรงแรม",           tone: "เปรียบเทียบ โรงแรม vs pool villa คุ้มกว่า ส่วนตัว ไม่ต้องแชร์ ราคาสมเหตุสมผล",   cta: "เปรียบเทียบแล้วจอง" },
  { id: "pv_checkin", emoji: "✅", label: "Check-in รีวิว",          desc: "วันแรก · Unboxing ห้อง · ความประทับใจแรก",        tone: "check-in รีวิวห้อง unboxing ความประทับใจแรก pool villa สะอาด สวย พัทยา",          cta: "มาลองด้วยตัวเอง" },
  { id: "friend",   emoji: "🤝", label: "รีวิวเพื่อนสนิท",      desc: "เสียงเป็นกันเอง · สบายๆ · แนะนำแบบเพื่อน",       tone: "สนุก กระชับ เป็นกันเอง เหมือนเพื่อนแนะนำ",              cta: "ลองดูได้เลย" },
  { id: "luxury",   emoji: "✨", label: "ลักชัวรี่ซีเนมาติก",   desc: "หรู · พรีเมียม · เน้นคุณค่าและความพิเศษ",           tone: "หรู พรีเมียม มีระดับ ซีเนมาติก บรรยายละเอียด",           cta: "สัมผัสความพิเศษ" },
  { id: "promo",    emoji: "🔥", label: "โปรโมชั่นเร่งด่วน",    desc: "เร่งด่วน · มีส่วนลด · กระตุ้นการจอง",             tone: "เร่งด่วน กระตุ้น โปรโมชั่น มีเวลาจำกัด ลด",             cta: "จองเลยวันนี้" },
  { id: "serious",  emoji: "🎯", label: "ซีเรียส / จริงจัง",    desc: "น้ำเสียงหนักแน่น · ตรงประเด็น · น่าเชื่อถือ",     tone: "ซีเรียส จริงจัง หนักแน่น พูดตรงๆ ไม่อ้อมค้อม",         cta: "ตัดสินใจเลย" },
  { id: "lifestyle",emoji: "🌟", label: "ไลฟ์สไตล์",             desc: "คนรุ่นใหม่ · อารมณ์ดี · Aesthetic",               tone: "ไลฟ์สไตล์ aesthetic อารมณ์ดี minimalist คนรุ่นใหม่",    cta: "เป็นส่วนหนึ่งของ lifestyle นี้" },
  { id: "funny",    emoji: "😂", label: "ตลก / เฮฮา",           desc: "ขำขัน · เซอร์ไพรส์ · ดูแล้วอยากแชร์",              tone: "ตลก เฮฮา ขำขัน เซอร์ไพรส์ มุกแบบไม่คาดฝัน ไวรัล",      cta: "แชร์ให้เพื่อนด้วย" },
  { id: "travel",   emoji: "✈️", label: "ท่องเที่ยว / Vlog",     desc: "บรรยากาศ · ความสวยงาม · เชิญชวน",               tone: "ท่องเที่ยว Vlog บรรยากาศดี เชิญชวน ผ่อนคลาย",           cta: "จองเลยก่อนเต็ม" },
];

const STEPS = [
  "AI สร้าง Video Clips จากรูป...",
  "AI วิเคราะห์สินค้า...",
  "สร้าง Script...",
  "สร้างเสียงพากย์...",
  "เรนเดอร์วิดีโอ...",
];

const VER_LABELS = ["A", "B", "C", "D", "E"];

type Status    = "idle" | "running" | "done" | "error";
type ClipPhase = "idle" | "generating" | "done";

export default function GeneratePage() {
  const router = useRouter();

  // ── existing state ─────────────────────────────────────────────────────────
  const [tpl, setTpl]                   = useState(TEMPLATES[0]);
  const [showTplModal, setShowTplModal] = useState(false);
  const [concept, setConcept]           = useState("");
  const [multiVer, setMultiVer]         = useState(false);
  const [verCount, setVerCount]         = useState(3);
  const [resolution, setResolution]     = useState("1080p·30s");
  const [voice, setVoice]               = useState("เป็นกันเอง (หญิง)");

  const [products, setProducts]         = useState<Product[]>([]);
  const [product, setProduct]           = useState<Product | null>(null);
  const [showPicker, setShowPicker]     = useState(false);

  const [status, setStatus]     = useState<Status>("idle");
  const [step, setStep]         = useState(0);
  const [errMsg, setErrMsg]     = useState("");
  const [results, setResults]   = useState<Record<string, string>>({});
  const [activeVer, setActiveVer]   = useState("A");
  const [startTime, setStartTime]   = useState(0);
  const [elapsed, setElapsed]       = useState(0);

  const [refImgFile, setRefImgFile] = useState<File | null>(null);
  const [refImgUrl, setRefImgUrl]   = useState("");

  // ── NEW: Image-to-Video state ──────────────────────────────────────────────
  const [videoStyle, setVideoStyle]         = useState(VIDEO_STYLES[0]);
  const [clipPhase, setClipPhase]           = useState<ClipPhase>("idle");
  const [generatedClips, setGeneratedClips] = useState<string[]>([]);
  const [selectedClip, setSelectedClip]     = useState<string | null>(null);
  const [phase1Open, setPhase1Open]         = useState(true);

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

  // ── NEW: generate video clips from images ──────────────────────────────────
  const generateClips = async () => {
    if (!product) { setShowPicker(true); return; }
    setClipPhase("generating");
    setGeneratedClips([]);
    setSelectedClip(null);
    try {
      const res = await api.post("/image-to-video/generate", {
        image_urls: product.media_urls,
        style: videoStyle.id,
        aspect_ratio: "9:16",
        count: 4,
      });
      setGeneratedClips(res.data.clip_urls || []);
    } catch {
      // Fallback: ใช้รูปสินค้าเป็น placeholder ก่อน backend พร้อม
      const imgs = product.media_urls?.slice(0, 4) || [];
      while (imgs.length < 4) imgs.push("");
      setGeneratedClips(imgs);
    }
    setClipPhase("done");
  };

  // ── existing helpers ───────────────────────────────────────────────────────
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
      params: {
        tone_of_voice: toneVariant,
        cta_style: tpl.cta,
        duration_sec: durSec,
        concept,
        base_video_url: selectedClip || undefined,
      },
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

  const reset = () => {
    setStatus("idle");
    setResults({});
    setErrMsg("");
    setClipPhase("idle");
    setGeneratedClips([]);
    setSelectedClip(null);
    setPhase1Open(true);
  };

  const activeUrl = results[activeVer] || "";

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter" style={{ padding: "28px 40px 20px" }}>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
          กลุ่ม 2 · AI สร้างคอนเทนต์
        </p>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-.02em",
          background: "linear-gradient(90deg, var(--teal), var(--blue))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>สร้างวิดีโอด้วย AI</h1>
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

      {/* ══════════════════════════════════════════════════════════════════════
          PHASE 1 — Image → Video AI
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: "var(--glass)",
        border: `1px solid ${clipPhase === "done" && selectedClip ? "rgba(0,255,212,.35)" : "var(--gb)"}`,
        borderRadius: 14, marginBottom: 14, overflow: "hidden",
        transition: "border-color .3s",
        boxShadow: clipPhase === "done" && selectedClip ? "0 0 24px rgba(0,255,212,.08)" : "none",
      }}>
        {/* Phase 1 header — click to toggle */}
        <div
          onClick={() => setPhase1Open(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", cursor: "pointer", userSelect: "none" }}
        >
          <div style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: clipPhase === "done" && selectedClip ? "rgba(0,255,212,.2)" : "var(--glass2)",
            border: `1px solid ${clipPhase === "done" && selectedClip ? "rgba(0,255,212,.5)" : "var(--gb)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 900,
            color: clipPhase === "done" && selectedClip ? "var(--teal)" : "var(--faint)",
            transition: "all .3s",
          }}>
            {clipPhase === "done" && selectedClip ? <Check size={13} /> : "1"}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
              Image → Video AI
            </span>
            {clipPhase === "done" && selectedClip ? (
              <span style={{ fontSize: 11, color: "var(--teal)", fontWeight: 700, marginLeft: 10 }}>
                {videoStyle.emoji} {videoStyle.label} · เลือก Clip แล้ว ✓
              </span>
            ) : clipPhase === "generating" ? (
              <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: 10 }}>
                กำลังสร้าง...
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: 10 }}>
                ใส่รูป → AI สร้างวิดีโอ 4 แบบ → เลือกที่ชอบ
              </span>
            )}
          </div>

          <ChevronDown
            size={14}
            color="var(--faint)"
            style={{ transform: phase1Open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s", flexShrink: 0 }}
          />
        </div>

        {/* Phase 1 body */}
        {phase1Open && (
          <div style={{ padding: "4px 18px 18px", borderTop: "1px solid var(--gb)" }}>

            {/* Product selector (inline for phase 1) */}
            <div style={{ marginTop: 14, marginBottom: 14 }}>
              <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                สินค้า / วิลล่า
              </p>
              <div onClick={() => setShowPicker(v => !v)} style={{
                background: "var(--bg)", border: `1px solid ${product ? "rgba(0,255,212,.3)" : "var(--gb)"}`,
                borderRadius: 10, padding: "9px 14px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontSize: 13, color: product ? "var(--text)" : "var(--faint)",
              }}>
                <span>{product ? `📦 ${product.name}` : "เลือกสินค้าก่อน..."}</span>
                <ChevronDown size={13} />
              </div>
              {showPicker && (
                <div style={{
                  background: "var(--surface)", border: "1px solid var(--gb)",
                  borderRadius: 10, overflow: "hidden", maxHeight: 160, overflowY: "auto", marginTop: 4,
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
            </div>

            {/* Visual Style picker */}
            <p style={{ margin: "0 0 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
              เลือก Visual Style
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
              {VIDEO_STYLES.map(s => (
                <div
                  key={s.id}
                  onClick={() => setVideoStyle(s)}
                  style={{
                    padding: "12px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center",
                    background: videoStyle.id === s.id ? s.color : "rgba(255,255,255,.02)",
                    border: `1.5px solid ${videoStyle.id === s.id ? s.border : "var(--gb)"}`,
                    boxShadow: videoStyle.id === s.id ? `0 0 18px ${s.glow}` : "none",
                    transition: "all .15s",
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 7 }}>{s.emoji}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 3, lineHeight: 1.3 }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: "var(--faint)", lineHeight: 1.4 }}>{s.desc}</div>
                  {videoStyle.id === s.id && (
                    <div style={{ marginTop: 7, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9.5, color: "var(--teal)", fontWeight: 700, background: "rgba(0,255,212,.1)", padding: "2px 7px", borderRadius: 4 }}>
                      ✓ เลือกอยู่
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Generate Clips button */}
            {clipPhase === "idle" && (
              <button
                onClick={generateClips}
                style={{
                  width: "100%", padding: "13px 20px", borderRadius: 12, cursor: "pointer",
                  background: "linear-gradient(90deg, rgba(0,255,212,.12), rgba(77,127,255,.12))",
                  border: "1px solid rgba(0,255,212,.3)", color: "var(--teal)",
                  fontSize: 13.5, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "all .15s",
                }}
              >
                <Video size={16} />
                สร้าง Video Clips จากรูป (4 แบบ)
              </button>
            )}

            {/* Generating state */}
            {clipPhase === "generating" && (
              <div style={{
                textAlign: "center", padding: "28px 0",
                background: "rgba(0,255,212,.03)", borderRadius: 12, border: "1px solid rgba(0,255,212,.1)",
              }}>
                <div style={{ position: "relative", width: 52, height: 52, margin: "0 auto 14px" }}>
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(0,255,212,.15)" }} />
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "var(--teal)", animation: "spin 1s linear infinite" }} />
                  <Video size={20} color="var(--teal)" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
                  AI กำลังสร้าง Video Clips...
                </div>
                <div style={{ fontSize: 11.5, color: "var(--faint)" }}>
                  {videoStyle.emoji} {videoStyle.label} · Seedance 1.5
                </div>
              </div>
            )}

            {/* Clip gallery — เลือก Clip */}
            {clipPhase === "done" && (
              <div>
                <p style={{ margin: "0 0 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                  เลือก Clip ที่ชอบ · คลิกเพื่อเลือก
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
                  {generatedClips.map((clip, i) => {
                    const isSelected = selectedClip === clip;
                    const isImg = clip && !clip.includes(".mp4") && !clip.includes(".mov");
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedClip(clip)}
                        style={{
                          position: "relative", borderRadius: 10, overflow: "hidden",
                          cursor: "pointer", aspectRatio: "9/16", background: "var(--bg)",
                          border: `2px solid ${isSelected ? "var(--teal)" : "var(--gb)"}`,
                          boxShadow: isSelected ? "0 0 20px rgba(0,255,212,.4)" : "none",
                          transition: "all .15s",
                        }}
                      >
                        {/* Clip content */}
                        {clip ? (
                          isImg ? (
                            <img
                              src={fileUrl(clip)}
                              alt={`clip-${i + 1}`}
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          ) : (
                            <video
                              src={fileUrl(clip)}
                              muted
                              loop
                              autoPlay={isSelected}
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          )
                        ) : (
                          <div style={{
                            width: "100%", height: "100%",
                            background: `linear-gradient(135deg, ${videoStyle.color}, rgba(77,127,255,.06))`,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                          }}>
                            <Video size={22} style={{ opacity: .3, color: "var(--teal)" }} />
                            <span style={{ fontSize: 10, color: "var(--faint)" }}>Clip {i + 1}</span>
                          </div>
                        )}

                        {/* Play icon overlay */}
                        {!isSelected && (
                          <div style={{
                            position: "absolute", inset: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(0,0,0,.2)",
                          }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%",
                              background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <Play size={13} color="#fff" fill="#fff" />
                            </div>
                          </div>
                        )}

                        {/* Selected checkmark */}
                        {isSelected && (
                          <div style={{
                            position: "absolute", top: 6, right: 6,
                            width: 22, height: 22, borderRadius: "50%",
                            background: "var(--teal)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: "0 2px 8px rgba(0,255,212,.5)",
                          }}>
                            <Check size={12} color="#06060A" strokeWidth={3} />
                          </div>
                        )}

                        {/* Clip number badge */}
                        <div style={{
                          position: "absolute", bottom: 6, left: 6,
                          fontSize: 9.5, fontWeight: 800,
                          background: "rgba(0,0,0,.65)", color: "#fff",
                          borderRadius: 5, padding: "2px 7px",
                        }}>
                          Clip {i + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={generateClips}
                    style={{
                      padding: "9px 16px", borderRadius: 10, cursor: "pointer",
                      background: "var(--glass2)", border: "1px solid var(--gb)",
                      color: "var(--faint)", fontSize: 12, fontWeight: 700,
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <RefreshCw size={12} /> สร้างใหม่
                  </button>

                  {selectedClip !== null && (
                    <button
                      onClick={() => setPhase1Open(false)}
                      style={{
                        flex: 1, padding: "9px 16px", borderRadius: 10, cursor: "pointer",
                        background: "linear-gradient(90deg,var(--teal),var(--blue))",
                        border: "none", color: "#06060A",
                        fontSize: 12.5, fontWeight: 900,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        boxShadow: "0 4px 16px rgba(0,255,212,.3)",
                      }}
                    >
                      ใช้ Clip นี้ → ไปขั้นตอนถัดไป <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PHASE 2 — Script · Voice · Render
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          background: "var(--glass2)", border: "1px solid var(--gb)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 900, color: "var(--faint)",
        }}>2</div>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--dim)" }}>Script · Voice · Render</span>
        {selectedClip ? (
          <span style={{ fontSize: 11, color: "var(--teal)", fontWeight: 700 }}>
            ← ใช้ Clip ที่เลือกจาก Phase 1
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--faint)" }}>
            — หรือข้ามขั้น 1 แล้ว Generate ตรงได้เลย
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ display: "flex", gap: 18, alignItems: "stretch", flex: 1, minHeight: 420 }}>

        {/* Left controls */}
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column" }}>
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
                <img src={refImgUrl} alt="ref" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 11, border: "1px solid rgba(0,255,212,.2)", display: "block" }} />
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
                borderRadius: 11, padding: "14px 12px",
                textAlign: "center", cursor: "pointer",
                background: refDrag ? "rgba(0,255,212,.04)" : "rgba(255,255,255,.01)",
                transition: "all .15s",
              }}>
                <input {...refInput()} />
                <ImagePlus size={16} color="var(--faint)" style={{ margin: "0 auto 6px", display: "block", opacity: .5 }} />
                <p style={{ margin: 0, fontSize: 11, color: "var(--faint)", fontWeight: 600 }}>{refDrag ? "วางรูปที่นี่…" : "เพิ่มรูปอ้างอิง (ไม่บังคับ)"}</p>
              </div>
            )}

            {/* Concept input */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                  อธิบายคอนเซ็ปต์
                </span>
                <span style={{ fontSize: 10, color: "var(--faint)", opacity: .6 }}>(ไม่บังคับ)</span>
              </div>
              <div style={{
                flex: 1, border: "1px solid var(--gb)", borderRadius: 10,
                background: "rgba(255,255,255,.03)", overflow: "hidden",
                display: "flex", flexDirection: "column",
              }}>
                <textarea value={concept} onChange={e => setConcept(e.target.value)}
                  placeholder={`เช่น "รีวิว${tpl.label} โทนสบายๆ เน้นสระส่วนตัว"`}
                  style={{
                    flex: 1, width: "100%", background: "transparent", border: "none",
                    color: "var(--text)", fontSize: 13, lineHeight: 1.7, resize: "none",
                    outline: "none", minHeight: 90, fontFamily: "inherit",
                    padding: "10px 12px",
                  }}
                />
                <div style={{ padding: "5px 12px", borderTop: "1px solid var(--gb)", background: "rgba(0,255,212,.03)" }}>
                  <span style={{ fontSize: 10, color: "var(--teal)", opacity: .8 }}>
                    💡 เว้นว่างได้ — AI สร้างอัตโนมัติ
                  </span>
                </div>
              </div>
            </div>

            {/* Multi-version toggle */}
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
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div style={{
          position: "relative", flex: 1, borderRadius: 16,
          padding: status === "running" ? 2 : 1,
          background: status === "running" ? "transparent" : "var(--gb)",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          {status === "running" && (
            <div style={{
              position: "absolute",
              width: "200%", height: "200%",
              top: "-50%", left: "-50%",
              background: "conic-gradient(from 0deg, transparent 0deg, #22D499 30deg, #00FFD4 50deg, #4D7FFF 85deg, #A855F7 110deg, transparent 150deg)",
              animation: "spin-border 1.8s linear infinite",
              transformOrigin: "center center",
            }} />
          )}

          <div style={{
            position: "relative",
            background: "var(--glass)", borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", flex: 1, overflow: "hidden",
          }}>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
              background: "radial-gradient(60% 60% at 70% 20%,rgba(0,255,212,.07),transparent),radial-gradient(50% 50% at 30% 80%,rgba(77,127,255,.07),transparent)" }} />

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

            {/* Selected style badge */}
            {selectedClip && (
              <div style={{
                position: "absolute", top: 14, right: 14, zIndex: 2,
                background: videoStyle.color, border: `1px solid ${videoStyle.border}`,
                borderRadius: 8, padding: "5px 11px", fontSize: 11,
                fontWeight: 700, display: "flex", alignItems: "center", gap: 5,
              }}>
                {videoStyle.emoji} {videoStyle.label}
              </div>
            )}

            {/* Version tabs */}
            {status === "done" && Object.keys(results).length > 1 && (
              <div style={{ position: "absolute", top: selectedClip ? 48 : 14, right: 14, zIndex: 2, display: "flex", gap: 4 }}>
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

              {/* IDLE */}
              {status === "idle" && (
                <div style={{ textAlign: "center", padding: "0 20px" }}>
                  <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 20px" }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(0,255,212,.15)", animation: "spin 8s linear infinite" }} />
                    <div style={{ position: "absolute", inset: 8, borderRadius: "50%", border: "1.5px dashed rgba(77,127,255,.2)", animation: "spin 5s linear infinite reverse" }} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, opacity: .5 }}>🎬</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--dim)", marginBottom: 6 }}>พร้อมสร้างวิดีโอ</div>
                  <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 16, lineHeight: 1.6 }}>
                    {selectedClip ? (
                      <>เลือก Clip แล้ว → กด Generate เพื่อสร้าง Script + Voice</>
                    ) : (
                      <>สร้าง Clip ใน Phase 1 ก่อน<br/>หรือกด Generate เพื่อสร้างตรงเลย</>
                    )}
                  </div>
                  <button onClick={() => router.push("/render-queue")} style={{
                    background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--dim)",
                    padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}>ดูคิวเรนเดอร์ →</button>
                </div>
              )}

              {/* RUNNING */}
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
                        width: 40, height: 3, borderRadius: 2,
                        background: i < step ? "var(--teal)" : i === step ? "rgba(0,255,212,.5)" : "rgba(255,255,255,.1)",
                        transition: "background .3s",
                      }} />
                    ))}
                  </div>
                </div>
              )}

              {/* DONE */}
              {status === "done" && (
                <div style={{ width: "100%", maxWidth: 340, margin: "0 auto" }}>
                  {activeUrl ? (
                    <>
                      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", boxShadow: "0 0 40px rgba(0,255,212,.2)" }}>
                        <video src={fileUrl(activeUrl)} controls style={{ width: "100%", aspectRatio: "9/16", background: "#000", display: "block", maxHeight: "55vh" }} />
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
                        }}><Play size={15} fill="var(--teal)" />พรีวิว</button>
                        <button onClick={reset} style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                          padding: "10px 8px", borderRadius: 11, cursor: "pointer",
                          background: "var(--glass)", border: "1px solid var(--gb)",
                          color: "var(--faint)", fontSize: 11, fontWeight: 700,
                        }}><RefreshCw size={15} />สร้างใหม่</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto 24px" }}>
                        <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "conic-gradient(var(--teal), var(--blue), var(--purple), var(--teal))", animation: "spin 3s linear infinite", opacity: .6 }} />
                        <div style={{ position: "absolute", inset: -3, borderRadius: "50%", background: "var(--surface)" }} />
                        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,255,212,.15) 0%, transparent 70%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <CheckCircle2 size={40} color="var(--ok)" strokeWidth={1.5} />
                        </div>
                      </div>
                      <p style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, background: "linear-gradient(90deg,var(--teal),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                        สร้างสำเร็จ!
                      </p>
                      <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--dim)" }}>
                        {product?.name} · {tpl.label}
                        {selectedClip && ` · ${videoStyle.emoji} ${videoStyle.label}`}
                      </p>
                      {elapsed > 0 && (
                        <p style={{ margin: "0 0 24px", fontSize: 11.5, color: "var(--faint)" }}>
                          ใช้เวลา {elapsed >= 60 ? `${Math.floor(elapsed/60)} นาที ${elapsed%60} วิ` : `${elapsed} วินาที`}
                        </p>
                      )}
                      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                        {[
                          { label: selectedClip ? "AI Video" : "AI Script", val: "✓" },
                          { label: "Voiceover", val: "✓" },
                          { label: "FFmpeg Render", val: "✓" },
                        ].map(s => (
                          <div key={s.label} style={{ padding: "5px 12px", borderRadius: 20, background: "rgba(34,212,153,.08)", border: "1px solid rgba(34,212,153,.2)", fontSize: 11, color: "var(--ok)", fontWeight: 700 }}>
                            {s.val} {s.label}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <button onClick={() => router.push("/preview")} style={{
                          width: "100%", padding: "14px 20px", borderRadius: 13, cursor: "pointer",
                          background: "linear-gradient(90deg,var(--teal),var(--blue))",
                          border: "none", color: "#06060A", fontSize: 14, fontWeight: 900,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          boxShadow: "0 6px 24px rgba(0,255,212,.3)",
                        }}>
                          <Play size={16} fill="#06060A" /> ดูวิดีโอใน Preview <ArrowRight size={14} />
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

              {/* ERROR */}
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
          marginLeft: "auto", position: "relative", overflow: "hidden",
          background: status === "running" ? "var(--glass2)" : "linear-gradient(90deg,#22D499,#00FFD4,#4D7FFF)",
          backgroundSize: "200% 200%",
          color: status === "running" ? "var(--faint)" : "#06060A",
          border: "none", padding: "12px 40px", borderRadius: 12,
          fontSize: 14, fontWeight: 900,
          cursor: status === "running" ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: 8,
          animation: status === "running" ? "none" : "gbg 3s ease infinite, btn-glow 2s ease-in-out infinite",
          transition: "all .2s",
        }}>
          {status !== "running" && (
            <div style={{
              position: "absolute", top: 0, left: "-80%", width: "50%", height: "100%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent)",
              animation: "shimmer 2.5s ease-in-out infinite",
              pointerEvents: "none",
            }} />
          )}
          {status === "running"
            ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> กำลังสร้าง...</>
            : <><Sparkles size={15} /> Generate</>}
        </button>
      </div>

      <p style={{ fontSize: 12, color: "var(--faint)", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.04)", lineHeight: 1.6 }}>
        เลือกเสียงได้ตรงนี้ — ตั้งค่าละเอียดเพิ่มเติมที่{" "}
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
        @keyframes spin-border { to{transform:rotate(360deg)} }
        @keyframes vpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.75)} }
        @keyframes btn-glow { 0%,100%{box-shadow:0 6px 20px rgba(34,212,153,.35)} 50%{box-shadow:0 6px 32px rgba(34,212,153,.6),0 0 0 4px rgba(34,212,153,.1)} }
        @keyframes shimmer { 0%{left:-80%} 100%{left:120%} }
      `}</style>
    </div>
  );
}
