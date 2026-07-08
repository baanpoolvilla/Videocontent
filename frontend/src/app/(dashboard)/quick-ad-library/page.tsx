"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Download, RefreshCw, Sparkles, Loader2, Play, Pause, Trash2, Pencil, Check, X } from "lucide-react";

interface Clip {
  id: string;
  product_name: string;
  script: string | null;
  video_url: string;
  voice_style: string | null;
  style: string | null;
  duration_sec: number | null;
  created_at: string;
}

const STYLE_LABELS: Record<string, string> = {
  warm: "Ken Burns",
  editorial: "Editorial หรู",
  prime: "Prime Location",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "เมื่อกี้";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

function ClipCard({
  clip, idx, onDelete, onRename,
}: {
  clip: Clip; idx: number; onDelete: () => void; onRename: (name: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(clip.product_name);
  const [saving, setSaving] = useState(false);

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
    if (!confirm(`ลบคลิป "${clip.product_name}"?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/quick-ad/clips/${clip.id}`);
      onDelete();
    } catch {
      alert("ลบไม่สำเร็จ");
      setDeleting(false);
    }
  };

  const saveRename = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === clip.product_name) { setEditing(false); setNameDraft(clip.product_name); return; }
    setSaving(true);
    try {
      await api.patch(`/quick-ad/clips/${clip.id}`, { product_name: trimmed });
      onRename(trimmed);
      setEditing(false);
    } catch {
      alert("เปลี่ยนชื่อไม่สำเร็จ");
      setNameDraft(clip.product_name);
    } finally {
      setSaving(false);
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
          src={fileUrl(clip.video_url)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onEnded={() => setPlaying(false)}
          playsInline
          preload="metadata"
        />
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
            : <Play size={36} style={{ color: "#fff", filter: "drop-shadow(0 2px 6px rgba(0,0,0,.8))" }} />}
        </button>
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "rgba(0,0,0,.6)", borderRadius: 6,
          padding: "2px 8px", fontSize: 11, color: "#fff", fontWeight: 700,
        }}>
          #{idx + 1}
        </div>
        {clip.style && (
          <div style={{
            position: "absolute", top: 8, right: 8,
            background: "rgba(0,0,0,.6)", borderRadius: 6,
            padding: "2px 8px", fontSize: 10, color: "#FFB02E", fontWeight: 700,
          }}>
            {STYLE_LABELS[clip.style] || clip.style}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px 12px" }}>
        {editing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") { setEditing(false); setNameDraft(clip.product_name); } }}
              style={{
                flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 6, fontSize: 12.5,
                background: "rgba(255,255,255,.06)", border: "1px solid var(--gb)", color: "var(--text)",
                outline: "none",
              }}
            />
            <button onClick={saveRename} disabled={saving} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--teal)", display: "flex" }}>
              {saving ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <Check size={14} />}
            </button>
            <button onClick={() => { setEditing(false); setNameDraft(clip.product_name); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", display: "flex" }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <p style={{
              margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={clip.product_name}>
              {clip.product_name}
            </p>
            <button
              onClick={() => setEditing(true)}
              title="เปลี่ยนชื่อ"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", display: "flex", flexShrink: 0 }}
            >
              <Pencil size={12} />
            </button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: "var(--dim)" }}>
            {clip.duration_sec ? `${clip.duration_sec}s` : ""}
          </span>
          <span style={{ fontSize: 11, color: "var(--dim)" }}>
            {timeAgo(clip.created_at)}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <a
            href={fileUrl(clip.video_url)}
            download
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "7px 0", borderRadius: 8,
              background: "rgba(255,176,46,.12)", border: "1px solid rgba(255,176,46,.25)",
              color: "#FFB02E", fontSize: 12.5, fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Download size={13} />
            ดาวน์โหลด
          </a>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="ลบคลิป"
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

export default function QuickAdLibraryPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/quick-ad/clips");
      setClips(res.data as Clip[]);
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
            <Sparkles size={20} style={{ marginRight: 8, verticalAlign: "middle", color: "#FFB02E" }} />
            คลังคลิป Quick Ad
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--dim)", fontSize: 13.5 }}>
            คลิปทั้งหมดที่สร้างจาก Quick Ad · เปลี่ยนชื่อ ดาวน์โหลด หรือลบได้
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

      {!loading && !error && clips.length === 0 && (
        <div style={{
          textAlign: "center", padding: "80px 20px",
          color: "var(--dim)", fontSize: 14,
        }}>
          <Sparkles size={48} style={{ opacity: .25, marginBottom: 16 }} />
          <p style={{ margin: 0 }}>ยังไม่มีคลิปที่สร้าง</p>
          <p style={{ margin: "6px 0 0", fontSize: 12.5 }}>
            ไปที่ <a href="/quick-ad" style={{ color: "#FFB02E" }}>Quick Ad</a> เพื่อสร้างคลิปแรก
          </p>
        </div>
      )}

      {!loading && clips.length > 0 && (
        <>
          <p style={{ margin: "0 0 16px", color: "var(--dim)", fontSize: 13 }}>
            {clips.length} คลิป — เรียงจากใหม่ไปเก่า
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}>
            {clips.map((c, i) => (
              <ClipCard
                key={c.id} clip={c} idx={i}
                onDelete={() => setClips((prev) => prev.filter((x) => x.id !== c.id))}
                onRename={(name) => setClips((prev) => prev.map((x) => x.id === c.id ? { ...x, product_name: name } : x))}
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
