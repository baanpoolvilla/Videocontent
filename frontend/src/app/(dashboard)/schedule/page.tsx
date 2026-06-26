"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock, CheckCircle2, AlertCircle, X, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

interface ScheduledPost {
  id: string;
  content_job_id: string;
  platform: string;
  caption: string | null;
  hashtags: string[] | null;
  scheduled_at: string | null;
  posted_at: string | null;
  status: string;
  created_at: string;
}

const PLATFORM_EMOJI: Record<string, string> = {
  tiktok: "🎵",
  instagram: "📸",
  youtube_shorts: "▶️",
  facebook: "👍",
  twitter: "🐦",
};

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube_shorts: "YouTube Shorts",
  facebook: "Facebook",
  twitter: "Twitter / X",
};

const STATUS: Record<string, { label: string; bg: string; color: string; icon: typeof Clock }> = {
  scheduled: { label: "ตั้งเวลาแล้ว", bg: "rgba(77,127,255,.15)", color: "#4D7FFF", icon: Clock },
  published:  { label: "โพสต์แล้ว",   bg: "rgba(34,212,153,.15)", color: "#22D499", icon: CheckCircle2 },
  failed:     { label: "ล้มเหลว",      bg: "rgba(255,80,80,.15)",  color: "#FF5050", icon: AlertCircle },
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default function SchedulePage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "scheduled" | "published" | "failed">("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/schedule/posts/");
      setPosts(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function cancelPost(id: string) {
    if (!confirm("ยืนยันการยกเลิกโพสต์?")) return;
    setDeleting(id);
    try {
      await api.delete(`/schedule/posts/${id}`);
      setPosts((p) => p.filter((x) => x.id !== id));
    } catch {
      alert("ยกเลิกไม่สำเร็จ");
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = filter === "all" ? posts : posts.filter((p) => p.status === filter);

  const counts = {
    all: posts.length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published:  posts.filter((p) => p.status === "published").length,
    failed:     posts.filter((p) => p.status === "failed").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d14", padding: "32px 40px", color: "#e2e4ef" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff" }}>
            ตั้งเวลาโพสต์
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            จัดการตารางโพสต์คอนเทนต์อัตโนมัติ
          </p>
        </div>
        <button
          onClick={load}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 10,
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
            color: "#9ca3af", fontSize: 13, cursor: "pointer",
          }}
        >
          <RefreshCw size={14} />
          รีเฟรช
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {(["all","scheduled","published","failed"] as const).map((s) => {
          const active = filter === s;
          const cfg = s === "all"
            ? { label: "ทั้งหมด", color: "#fff", bg: "rgba(255,255,255,.06)" }
            : { label: STATUS[s].label, color: STATUS[s].color, bg: STATUS[s].bg };
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              background: active ? cfg.bg : "rgba(255,255,255,.03)",
              border: `1px solid ${active ? cfg.color + "44" : "rgba(255,255,255,.06)"}`,
              borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left",
              transition: "all .15s",
            }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: active ? cfg.color : "#fff" }}>
                {counts[s]}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Table card */}
      <div style={{
        background: "#111116", border: "1px solid rgba(255,255,255,.07)",
        borderRadius: 16, overflow: "hidden",
      }}>
        {/* Card header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.06)",
        }}>
          <Calendar size={16} color="#4D7FFF" />
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>ตารางโพสต์</span>
          <span style={{
            marginLeft: "auto", fontSize: 11, color: "#6b7280",
            background: "rgba(255,255,255,.05)", borderRadius: 6, padding: "2px 8px",
          }}>
            {visible.length} รายการ
          </span>
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#6b7280", fontSize: 14 }}>
            <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
            <p>กำลังโหลด...</p>
          </div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: "center", color: "#FF5050", fontSize: 14 }}>
            <AlertCircle size={24} style={{ marginBottom: 8 }} />
            <p>{error}</p>
            <button onClick={load} style={{
              marginTop: 12, padding: "8px 20px", borderRadius: 8,
              background: "rgba(255,80,80,.15)", border: "1px solid #FF505044",
              color: "#FF5050", cursor: "pointer", fontSize: 13,
            }}>ลองใหม่</button>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 56, textAlign: "center", color: "#4b5563" }}>
            <Calendar size={36} style={{ marginBottom: 12, opacity: .4 }} />
            <p style={{ fontSize: 14 }}>ไม่มีรายการที่ตั้งเวลา</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              ตั้งเวลาโพสต์ได้จากหน้า Preview หลังจากสร้างวิดีโอ
            </p>
          </div>
        ) : (
          <div>
            {visible.map((post, i) => {
              const s = STATUS[post.status] ?? STATUS.scheduled;
              const Icon = s.icon;
              const platform = post.platform.toLowerCase();
              return (
                <div key={post.id} style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "14px 20px",
                  borderBottom: i < visible.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  transition: "background .12s",
                }}>
                  {/* Platform badge */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, flexShrink: 0,
                  }}>
                    {PLATFORM_EMOJI[platform] ?? "📲"}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>
                        {PLATFORM_LABEL[platform] ?? post.platform}
                      </p>
                      <span style={{
                        fontSize: 10, color: "#6b7280", background: "rgba(255,255,255,.05)",
                        borderRadius: 4, padding: "1px 6px",
                      }}>
                        {post.content_job_id.slice(0, 8)}
                      </span>
                    </div>
                    {post.caption && (
                      <p style={{
                        margin: "3px 0 0", fontSize: 12, color: "#9ca3af",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {post.caption}
                      </p>
                    )}
                    {post.hashtags && post.hashtags.length > 0 && (
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>
                        {post.hashtags.slice(0, 4).map((h) => `#${h}`).join(" ")}
                        {post.hashtags.length > 4 && " …"}
                      </p>
                    )}
                  </div>

                  {/* Schedule time */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
                      {post.status === "published" ? fmt(post.posted_at) : fmt(post.scheduled_at)}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "#4b5563" }}>
                      {post.status === "published" ? "โพสต์เมื่อ" : "กำหนดการ"}
                    </p>
                  </div>

                  {/* Status badge */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 8,
                    background: s.bg, color: s.color,
                    fontSize: 11, fontWeight: 600, flexShrink: 0,
                    border: `1px solid ${s.color}33`,
                  }}>
                    <Icon size={12} />
                    {s.label}
                  </div>

                  {/* Cancel button — only for scheduled */}
                  {post.status === "scheduled" && (
                    <button
                      onClick={() => cancelPost(post.id)}
                      disabled={deleting === post.id}
                      style={{
                        width: 28, height: 28, borderRadius: 7,
                        background: "rgba(255,80,80,.08)", border: "1px solid rgba(255,80,80,.2)",
                        color: "#FF5050", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty state tip */}
      {!loading && posts.length === 0 && !error && (
        <div style={{
          marginTop: 20, padding: 16, borderRadius: 12,
          background: "rgba(77,127,255,.06)", border: "1px solid rgba(77,127,255,.15)",
          fontSize: 13, color: "#6b7280", display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <Plus size={15} color="#4D7FFF" style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            ตั้งเวลาโพสต์ได้จากหน้า{" "}
            <a href="/preview" style={{ color: "#4D7FFF", textDecoration: "none" }}>Preview</a>
            {" "}หลังจาก generate วิดีโอเสร็จ แล้วกด <b>Publish on Social 🚀</b>
          </span>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
