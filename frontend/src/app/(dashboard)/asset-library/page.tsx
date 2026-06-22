"use client";

import { useEffect, useRef, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Upload, Trash2, Copy, Check, Image, Film, Music, RefreshCw, Loader2, X } from "lucide-react";

interface Asset {
  id: string; name: string; asset_type: string; url: string;
  size_bytes: number | null; mime_type: string | null; created_at: string;
}

const TYPE_TABS = [
  { key: "",         label: "ทั้งหมด", icon: "📁" },
  { key: "image",    label: "รูปภาพ",  icon: "🖼️" },
  { key: "video",    label: "วิดีโอ",  icon: "🎬" },
  { key: "audio",    label: "เสียง",   icon: "🎵" },
  { key: "logo",     label: "โลโก้",   icon: "🏷️" },
  { key: "overlay",  label: "Overlay", icon: "🔲" },
  { key: "intro",    label: "Intro",   icon: "▶️" },
  { key: "outro",    label: "Outro",   icon: "⏹️" },
];

function formatBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

function CopyUrlBtn({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const full = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/v1/files${url}`;
  return (
    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      title="คัดลอก URL" style={{
        padding: "4px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
        border: `1px solid ${copied ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
        background: copied ? "rgba(0,255,212,.1)" : "var(--glass)", color: copied ? "var(--teal)" : "var(--faint)",
      }}>
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

function AssetCard({ asset, onDelete }: { asset: Asset; onDelete: () => void }) {
  const isImg   = asset.mime_type?.startsWith("image/");
  const isVideo = asset.mime_type?.startsWith("video/");
  const isAudio = asset.mime_type?.startsWith("audio/");
  const src = fileUrl(asset.url);

  return (
    <div style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Preview */}
      <div style={{ height: 130, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
        {isImg ? (
          <img src={src} alt={asset.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : isVideo ? (
          <video src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
        ) : isAudio ? (
          <Music size={36} style={{ opacity: .25 }} />
        ) : (
          <Film size={36} style={{ opacity: .25 }} />
        )}
        <span style={{ position: "absolute", top: 6, left: 6, fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", padding: "2px 7px", borderRadius: 5, background: "rgba(0,0,0,.55)", color: "#fff" }}>
          {asset.asset_type}
        </span>
      </div>
      {/* Info */}
      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, wordBreak: "break-all" }}>
          {asset.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--faint)" }}>{formatBytes(asset.size_bytes)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
          <CopyUrlBtn url={asset.url} />
          <button onClick={onDelete} style={{
            padding: "4px 8px", borderRadius: 6, cursor: "pointer",
            background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "var(--err)",
          }}><Trash2 size={10} /></button>
        </div>
      </div>
    </div>
  );
}

export default function AssetLibraryPage() {
  const [assets, setAssets]   = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [uploadType, setUploadType] = useState("image");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/assets/${tab ? `?asset_type=${tab}` : ""}`);
      setAssets(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("asset_type", uploadType);
        form.append("name", file.name);
        await api.post("/assets/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      }
      await load();
    } finally { setUploading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ลบ asset นี้?")) return;
    await api.delete(`/assets/${id}`);
    setAssets(a => a.filter(x => x.id !== id));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    upload(e.dataTransfer.files);
  };

  return (
    <div className="page-enter" style={{ padding: "28px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        ระบบ · Assets
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, letterSpacing: "-.02em", background: "linear-gradient(90deg,var(--teal),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Asset Library
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--faint)" }}>รูป, วิดีโอ, เสียง, โลโก้ — นำกลับมาใช้ได้ทุกครั้ง</p>
        </div>
        <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCw size={13} /> รีเฟรช</button>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--teal)" : "var(--gb)"}`,
          borderRadius: 14, padding: "28px 20px", marginBottom: 20, cursor: "pointer",
          background: dragOver ? "rgba(0,255,212,.04)" : "rgba(255,255,255,.02)",
          textAlign: "center", transition: "all .2s",
        }}>
        <input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={e => upload(e.target.files)} accept="image/*,video/*,audio/*" />
        {uploading ? (
          <Loader2 size={22} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px", display: "block", color: "var(--teal)" }} />
        ) : (
          <Upload size={22} style={{ margin: "0 auto 8px", display: "block", opacity: .4 }} />
        )}
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--dim)", marginBottom: 4 }}>
          {uploading ? "กำลังอัปโหลด..." : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก"}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 12 }}>รองรับ JPG, PNG, MP4, MP3 และอื่นๆ</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
          {TYPE_TABS.slice(1).map(t => (
            <button key={t.key} onClick={e => { e.stopPropagation(); setUploadType(t.key); }} style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: uploadType === t.key ? "rgba(0,255,212,.12)" : "var(--glass2)",
              border: `1px solid ${uploadType === t.key ? "rgba(0,255,212,.3)" : "var(--gb)"}`,
              color: uploadType === t.key ? "var(--teal)" : "var(--faint)",
            }}>{t.icon} {t.label}</button>
          ))}
        </div>
      </div>

      {/* Type filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto", paddingBottom: 2 }}>
        {TYPE_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            background: tab === t.key ? "rgba(0,255,212,.12)" : "var(--glass)",
            border: `1px solid ${tab === t.key ? "rgba(0,255,212,.3)" : "var(--gb)"}`,
            color: tab === t.key ? "var(--teal)" : "var(--faint)",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--faint)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} />
          กำลังโหลด...
        </div>
      ) : assets.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, background: "var(--glass)", borderRadius: 14, border: "1px solid var(--gb)", color: "var(--faint)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>ยังไม่มี Asset</div>
          <div style={{ fontSize: 12 }}>ลากไฟล์มาวางด้านบนเพื่อเริ่มต้น</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {assets.map(a => <AssetCard key={a.id} asset={a} onDelete={() => handleDelete(a.id)} />)}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
