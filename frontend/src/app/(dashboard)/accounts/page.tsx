"use client";

import { useState } from "react";
import { Link2, CheckCircle2, Plus, Zap } from "lucide-react";

const PLATFORMS = [
  {
    id: "tiktok", name: "TikTok", icon: "🎵",
    desc: "โพสต์วิดีโออัตโนมัติผ่าน TikTok API",
    color: "#ff0050", connected: false,
  },
  {
    id: "instagram", name: "Instagram / Meta",icon: "📸",
    desc: "โพสต์ Reels และ Stories ผ่าน Meta Graph API",
    color: "#c13584", connected: false,
  },
  {
    id: "facebook", name: "Facebook Page", icon: "📘",
    desc: "โพสต์วิดีโอลง Facebook Page โดยอัตโนมัติ",
    color: "#1877f2", connected: false,
  },
  {
    id: "youtube", name: "YouTube", icon: "▶️",
    desc: "อัปโหลด YouTube Shorts ผ่าน Data API v3",
    color: "#ff0000", connected: false,
  },
  {
    id: "line", name: "LINE Official", icon: "💚",
    desc: "ส่งโพสต์ผ่าน LINE Messaging API",
    color: "#00b900", connected: false,
  },
];

const INTEGRATIONS = [
  { name: "n8n Workflow",  icon: "⚙️",  desc: "เชื่อมต่อกับ n8n สำหรับ automation pipeline",    status: "active"  },
  { name: "Webhook",       icon: "🔗",  desc: "ส่ง notification ไปที่ URL ที่กำหนด",            status: "active"  },
  { name: "Google Drive",  icon: "💾",  desc: "บันทึกวิดีโอลง Google Drive อัตโนมัติ",           status: "inactive" },
  { name: "Zapier",        icon: "⚡",  desc: "เชื่อมต่อกับ 5,000+ แอปผ่าน Zapier",             status: "inactive" },
];

export default function AccountsPage() {
  const [platforms, setPlatforms] = useState(PLATFORMS);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const connect = (id: string) => {
    showToast("ฟีเจอร์นี้จะเปิดใช้งานเร็วๆ นี้ — ขณะนี้รองรับการโพสต์ด้วยตนเองผ่านหน้า โพสต์เอง");
  };

  return (
    <div className="page-enter" style={{ padding: "32px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>13 · ระบบ</p>
      <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>เชื่อมต่อบัญชี</h1>
      <p style={{ margin: "0 0 28px", fontSize: 13, color: "var(--dim)" }}>เชื่อมต่อ Social Media เพื่อโพสต์อัตโนมัติ</p>

      {/* Social platforms */}
      <h2 style={{ fontSize: 13.5, fontWeight: 700, color: "var(--dim)", marginBottom: 12 }}>Social Media</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 30 }}>
        {platforms.map(p => (
          <div key={p.id} style={{
            background: "var(--glass)", border: `1px solid ${p.connected ? `${p.color}44` : "var(--gb)"}`,
            borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: `${p.color}18`, border: `1px solid ${p.color}33`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>
              {p.icon}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 2px", fontSize: 13.5, fontWeight: 700 }}>{p.name}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--faint)" }}>{p.desc}</p>
            </div>
            {p.connected ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ok)", background: "rgba(34,212,153,.1)", padding: "4px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <CheckCircle2 size={11} /> เชื่อมต่อแล้ว
                </span>
                <button onClick={() => setPlatforms(prev => prev.map(x => x.id === p.id ? { ...x, connected: false } : x))} style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: "1px solid var(--gb)", background: "transparent", color: "var(--err)",
                }}>ยกเลิก</button>
              </div>
            ) : (
              <button onClick={() => connect(p.id)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${p.color}44`, background: `${p.color}10`, color: p.color,
              }}>
                <Plus size={13} /> เชื่อมต่อ
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Integrations */}
      <h2 style={{ fontSize: 13.5, fontWeight: 700, color: "var(--dim)", marginBottom: 12 }}>Integrations & Webhooks</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        {INTEGRATIONS.map(item => (
          <div key={item.name} style={{
            background: "var(--glass)", border: `1px solid ${item.status === "active" ? "rgba(0,255,212,.2)" : "var(--gb)"}`,
            borderRadius: 14, padding: "16px 18px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{item.name}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: item.status === "active" ? "rgba(34,212,153,.1)" : "rgba(255,255,255,.05)", color: item.status === "active" ? "var(--ok)" : "var(--faint)" }}>
                {item.status === "active" ? "เปิด" : "ปิด"}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--faint)", lineHeight: 1.55 }}>{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Coming soon notice */}
      <div style={{ padding: "16px 20px", background: "rgba(77,127,255,.06)", border: "1px solid rgba(77,127,255,.18)", borderRadius: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Zap size={16} color="var(--blue)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Auto-post กำลังพัฒนา</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--dim)", lineHeight: 1.65 }}>
            ขณะนี้ระบบรองรับ <b>โพสต์ด้วยตนเอง</b> ผ่านหน้า "โพสต์เอง" —
            ฟีเจอร์ auto-post จะเปิดใช้งานพร้อมกับ TikTok API และ Meta API ใน version ถัดไป
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 999,
          background: "var(--surface)", border: "1px solid var(--gb)", borderRadius: 12,
          padding: "12px 20px", fontSize: 13, color: "var(--text)",
          boxShadow: "0 8px 32px rgba(0,0,0,.4)", maxWidth: 400, textAlign: "center",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Link2 size={14} color="var(--teal)" />{toast}
        </div>
      )}
    </div>
  );
}
