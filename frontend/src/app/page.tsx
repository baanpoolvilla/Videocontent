"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, Package, Film, BarChart3, ArrowRight, Play } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(true);
    const token = localStorage.getItem("access_token");
    if (token) router.replace("/dashboard");
  }, [router]);

  if (!loaded) return null;

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", color: "var(--text)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Ambient orbs */}
      <div className="bg-canvas">
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="orb orb3" />
      </div>

      {/* Nav */}
      <nav style={{
        position: "relative", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 48px", borderBottom: "1px solid var(--gb)",
        background: "rgba(6,6,10,.8)", backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11,
            background: "linear-gradient(135deg, var(--teal), var(--blue))",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 20px rgba(0,255,212,.35)",
          }}>
            <Zap size={17} color="#06060A" strokeWidth={3} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.01em" }}>AI Content Studio</span>
        </div>
        <Link href="/login" style={{ textDecoration: "none" }}>
          <button className="btn btn-primary btn-sm">เข้าสู่ระบบ <ArrowRight size={13} /></button>
        </Link>
      </nav>

      {/* Hero */}
      <div style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center",
        textAlign: "center", padding: "90px 40px 60px",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "6px 16px", borderRadius: 20,
          background: "rgba(0,255,212,.1)", border: "1px solid rgba(0,255,212,.22)",
          fontSize: 12.5, fontWeight: 700, color: "var(--teal)", marginBottom: 24,
        }}>
          <span className="live-dot" />
          ระบบพร้อมใช้งาน · AI Pipeline v2.0
        </div>

        <h1 style={{
          margin: "0 0 20px", fontSize: "clamp(36px, 5vw, 64px)",
          fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.1,
          maxWidth: 800,
        }}>
          สร้างวิดีโอโปรโมท<br />
          <span style={{
            background: "linear-gradient(135deg, var(--teal) 30%, var(--blue) 70%, var(--purple))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>ด้วย AI ในไม่กี่นาที</span>
        </h1>

        <p style={{
          margin: "0 0 36px", fontSize: 18, color: "var(--dim)", lineHeight: 1.65,
          maxWidth: 560,
        }}>
          อัปโหลดรูปสินค้า → AI วิเคราะห์ → สร้าง Script → เสียงพากย์ → เรนเดอร์วิดีโอ
          <br />ครบในขั้นตอนเดียว ฟรี 100%
        </p>

        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/login" style={{ textDecoration: "none" }}>
            <button className="gen-btn">
              เริ่มต้นใช้งาน <ArrowRight size={16} />
            </button>
          </Link>
          <Link href="/login" style={{ textDecoration: "none" }}>
            <button className="btn btn-ghost">
              <Play size={14} />ดูตัวอย่าง
            </button>
          </Link>
        </div>
      </div>

      {/* Features */}
      <div style={{
        position: "relative", zIndex: 1,
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 16, maxWidth: 1100, margin: "0 auto", padding: "0 40px 80px",
      }}>
        {[
          { icon: Package,  color: "var(--teal)",   step: "01", title: "อัปโหลดสินค้า",   desc: "อัปโหลดรูปภาพสินค้า AI วิเคราะห์จุดขาย กลุ่มเป้าหมาย อัตโนมัติ" },
          { icon: Zap,      color: "var(--blue)",   step: "02", title: "สร้าง Script AI",  desc: "Groq llama-3.3-70b สร้าง Script ภาษาไทย Hook + Body + CTA" },
          { icon: Film,     color: "var(--purple)", step: "03", title: "เรนเดอร์วิดีโอ",   desc: "FFmpeg รวมภาพ + เสียง → MP4 (9:16) พร้อม TikTok, Instagram" },
          { icon: BarChart3, color: "var(--pink)",  step: "04", title: "Analytics",        desc: "วิเคราะห์ CTR, Views, Engagement ปรับปรุง Script รุ่นถัดไป" },
        ].map(({ icon: Icon, color, step, title, desc }) => (
          <div key={step} className="card" style={{ padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11,
                background: `${color}18`, border: `1px solid ${color}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={17} color={color} strokeWidth={2} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--faint)", letterSpacing: ".08em" }}>STEP {step}</span>
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--faint)", lineHeight: 1.6 }}>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
