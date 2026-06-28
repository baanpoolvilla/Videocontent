"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Download, RefreshCw, VideoIcon, Loader2, Play, Pause, Trash2 } from "lucide-react";

interface SavedVideo {
  url: string;
  name: string;
  size_mb: number;
  created: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "เมื่อกี้";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

function VideoCard({ v, idx, onDelete }: { v: SavedVideo; idx: number; onDelete: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing,   setPlaying]   = useState(false);
  const [hovered,   setHovered]   = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const toggle = async () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      try {
        await videoRef.current.play();
        setPlaying(true);
      } catch {
        // AbortError: play interrupted — ignore
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm("ลบวิดีโอนี้?")) return;
    setDeleting(true);
    try {
      await api.delete(`/video-edit/${v.name}`);
      onDelete();
    } catch {
      alert("ลบไม่สำเร็จ");
      setDeleting(false);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--glass)", border: "1px solid var(--gb)",
        borderRadius: 14, overflow: "hidden",
        transition: "transform .15s, box-shadow .15s",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? "0 8px 32px rgba(0,0,0,.35)" : "none",
      }}
    >
      {/* Video preview */}
      <div style={{ position: "relative", background: "#000", aspectRatio: "9/16", maxHeight: 280 }}>
        <video
          ref={videoRef}
          src={v.url}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onEnded={() => setPlaying(false)}
          playsInline
          preload="metadata"
        />
        {/* Play/Pause overlay */}
        <button
          onClick={toggle}
          style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: playing ? "transparent" : "rgba(0,0,0,.35)",
            border: "none", cursor: "pointer",
            opacity: hovered || !playing ? 1 : 0,
            transition: "opacity .2s",
          }}
        >
          {playing
            ? <Pause size={36} style={{ color: "#fff", filter: "drop-shadow(0 2px 6px rgba(0,0,0,.8))" }} />
            : <Play  size={36} style={{ color: "#fff", filter: "drop-shadow(0 2px 6px rgba(0,0,0,.8))" }} />}
        </button>
        {/* Index badge */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "rgba(0,0,0,.6)", borderRadius: 6,
          padding: "2px 8px", fontSize: 11, color: "#fff", fontWeight: 700,
        }}>
          #{idx + 1}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "var(--teal)", fontWeight: 700 }}>
            {v.size_mb} MB
          </span>
          <span style={{ fontSize: 11, color: "var(--dim)" }}>
            {timeAgo(v.created)}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <a
            href={v.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "7px 0", borderRadius: 8,
              background: "rgba(0,255,212,.12)", border: "1px solid rgba(0,255,212,.25)",
              color: "var(--teal)", fontSize: 12.5, fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Download size={13} />
            ดาวน์โหลด
          </a>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="ลบวิดีโอ"
            style={{
              width: 34, borderRadius: 8, border: "1px solid rgba(255,80,80,.3)",
              background: "rgba(255,80,80,.08)", color: "#ff6b6b",
              cursor: deleting ? "wait" : "pointer", fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {deleting ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VideoLibraryPage() {
  const [videos,   setVideos]   = useState<SavedVideo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/video-edit");
      setVideos((res.data as { videos: SavedVideo[] }).videos || []);
    } catch {
      setError("โหลดรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 60px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--text)" }}>
            <VideoIcon size={20} style={{ marginRight: 8, verticalAlign: "middle" }} />
            คลังวิดีโอที่ตัดต่อ
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--dim)", fontSize: 13.5 }}>
            วิดีโอทั้งหมดที่ render เสร็จแล้ว · คลิกเพื่อเล่น หรือดาวน์โหลด
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600,
            border: "1px solid var(--gb)", background: "var(--glass2)",
            color: "var(--dim)", cursor: "pointer",
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? "spin .8s linear infinite" : "none" }} />
          รีเฟรช
        </button>
      </div>

      {/* States */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--dim)" }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          <p>กำลังโหลด...</p>
        </div>
      )}

      {error && !loading && (
        <div style={{
          background: "rgba(255,80,80,.1)", border: "1px solid rgba(255,80,80,.3)",
          borderRadius: 10, padding: "14px 18px", color: "#ff6b6b", fontSize: 13.5,
        }}>
          {error}
        </div>
      )}

      {!loading && !error && videos.length === 0 && (
        <div style={{
          textAlign: "center", padding: "80px 20px",
          color: "var(--dim)", fontSize: 14,
        }}>
          <VideoIcon size={48} style={{ opacity: .25, marginBottom: 16 }} />
          <p style={{ margin: 0 }}>ยังไม่มีวิดีโอที่ตัดต่อ</p>
          <p style={{ margin: "6px 0 0", fontSize: 12.5 }}>
            ไปที่ <a href="/edit" style={{ color: "var(--teal)" }}>ตัดต่อวิดีโอ AI</a> เพื่อสร้างวิดีโอแรก
          </p>
        </div>
      )}

      {/* Grid */}
      {!loading && videos.length > 0 && (
        <>
          <p style={{ margin: "0 0 16px", color: "var(--dim)", fontSize: 13 }}>
            {videos.length} วิดีโอ — เรียงจากใหม่ไปเก่า
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}>
            {videos.map((v, i) => (
              <VideoCard
                key={v.name} v={v} idx={i}
                onDelete={() => setVideos(prev => prev.filter(x => x.name !== v.name))}
              />
            ))}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
