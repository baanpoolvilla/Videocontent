"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api, fileUrl } from "@/lib/api";
import { Headphones, Trash2, Pencil, Check, X, Play, Pause, Film, Loader2, Plus } from "lucide-react";

interface AudioAsset {
  id: string;
  name: string;
  url: string;
  voice_style: string | null;
  characters_used: number;
  script_text: string | null;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AudioLibraryPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<AudioAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api.get("/audio-assets/")
      .then(r => setAssets(r.data))
      .finally(() => setLoading(false));
  }, []);

  function togglePlay(asset: AudioAsset) {
    const url = fileUrl(asset.url);
    if (playingId === asset.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
      audio.onended = () => setPlayingId(null);
      setPlayingId(asset.id);
    }
  }

  async function saveRename(id: string) {
    if (!editName.trim()) return;
    const updated = await api.patch(`/audio-assets/${id}`, { name: editName.trim() });
    setAssets(prev => prev.map(a => a.id === id ? { ...a, name: updated.data.name } : a));
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.delete(`/audio-assets/${id}`);
      setAssets(prev => prev.filter(a => a.id !== id));
      if (playingId === id) { audioRef.current?.pause(); setPlayingId(null); }
    } finally {
      setDeletingId(null);
    }
  }

  function useInVideo(asset: AudioAsset) {
    router.push(`/preview?audio_url=${encodeURIComponent(fileUrl(asset.url))}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d14", padding: "32px 40px", color: "#e2e4ef" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(0,255,212,.12)", border: "1px solid rgba(0,255,212,.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Headphones size={16} color="#00FFD4" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff" }}>Audio Library</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>คลังเสียงพากย์ทั้งหมด</p>
          </div>
        </div>
        <button onClick={() => router.push("/voice")} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10,
          background: "linear-gradient(135deg, rgba(0,255,212,.2), rgba(77,127,255,.2))",
          border: "1px solid rgba(0,255,212,.35)", color: "#00FFD4",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>
          <Plus size={14} /> สร้างเสียงใหม่
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={28} color="#00FFD4" style={{ animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {/* Empty */}
      {!loading && assets.length === 0 && (
        <div style={{
          textAlign: "center", padding: "80px 40px",
          background: "#111116", border: "1px dashed rgba(255,255,255,.08)", borderRadius: 16,
        }}>
          <Headphones size={48} color="#1f2937" style={{ marginBottom: 16 }} />
          <p style={{ margin: "0 0 6px", fontSize: 15, color: "#4b5563", fontWeight: 700 }}>ยังไม่มีเสียงที่บันทึก</p>
          <p style={{ margin: "0 0 20px", fontSize: 12, color: "#374151" }}>ไปสร้างเสียงใน Voice Generator แล้วกด "บันทึก"</p>
          <button onClick={() => router.push("/voice")} style={{
            padding: "10px 22px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
            background: "rgba(0,255,212,.12)", border: "1px solid rgba(0,255,212,.3)", color: "#00FFD4",
          }}>
            ไป Voice Generator →
          </button>
        </div>
      )}

      {/* List */}
      {!loading && assets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {assets.map(asset => (
            <div key={asset.id} style={{
              background: "#111116", border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 14, padding: "16px 20px",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              {/* Play button */}
              <button onClick={() => togglePlay(asset)} style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: playingId === asset.id ? "rgba(0,255,212,.2)" : "rgba(255,255,255,.06)",
                border: `1px solid ${playingId === asset.id ? "rgba(0,255,212,.4)" : "rgba(255,255,255,.1)"}`,
                color: playingId === asset.id ? "#00FFD4" : "#9ca3af",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {playingId === asset.id ? <Pause size={16} /> : <Play size={16} />}
              </button>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === asset.id ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveRename(asset.id); if (e.key === "Escape") setEditingId(null); }}
                      autoFocus
                      style={{
                        flex: 1, padding: "5px 10px", borderRadius: 7, fontSize: 13,
                        background: "#1a1a22", border: "1px solid rgba(0,255,212,.4)",
                        color: "#fff", outline: "none",
                      }}
                    />
                    <button onClick={() => saveRename(asset.id)} style={{ background: "none", border: "none", color: "#00FFD4", cursor: "pointer" }}><Check size={15} /></button>
                    <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer" }}><X size={15} /></button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e4ef", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {asset.name}
                    </span>
                    <button onClick={() => { setEditingId(asset.id); setEditName(asset.name); }} style={{
                      background: "none", border: "none", color: "#4b5563", cursor: "pointer", padding: 2,
                    }}>
                      <Pencil size={11} />
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                  {asset.voice_style && (
                    <span style={{ fontSize: 11, color: "#6b7280" }}>🎙️ {asset.voice_style}</span>
                  )}
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{asset.characters_used.toLocaleString()} chars</span>
                  <span style={{ fontSize: 11, color: "#4b5563" }}>{fmtDate(asset.created_at)}</span>
                </div>
                {asset.script_text && (
                  <p style={{
                    margin: "6px 0 0", fontSize: 11, color: "#4b5563",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {asset.script_text}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => useInVideo(asset)} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                  background: "rgba(77,127,255,.15)", border: "1px solid rgba(77,127,255,.3)",
                  color: "#4D7FFF", fontSize: 11, fontWeight: 700,
                }}>
                  <Film size={11} /> ใส่ลงวิดีโอ
                </button>
                <button onClick={() => handleDelete(asset.id)} disabled={deletingId === asset.id} style={{
                  width: 34, height: 34, borderRadius: 8, cursor: "pointer",
                  background: "rgba(255,80,80,.08)", border: "1px solid rgba(255,80,80,.2)",
                  color: "#FF5050", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {deletingId === asset.id
                    ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                    : <Trash2 size={12} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
