"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, fileUrl } from "@/lib/api";
import { Package, Plus, X, Loader2, Search, Zap, Image as ImgIcon, Trash2, ArrowRight } from "lucide-react";
import { useDropzone } from "react-dropzone";

interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  media_urls: string[];
}

type Form = { name: string; description: string; category: string; price: string };
const EMPTY: Form = { name: "", description: "", category: "", price: "" };

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm]         = useState<Form>(EMPTY);
  const [search, setSearch]     = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  useEffect(() => {
    api.get("/products/")
      .then((r) => setProducts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const clearFile = () => {
    setUploadFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    setUploadProgress("กำลังสร้างสินค้า…");
    try {
      // Step 1: create product
      const res = await api.post("/products/", {
        name: form.name,
        description: form.description || null,
        category: form.category || null,
        price: form.price ? parseFloat(form.price) : null,
      });
      const product: Product = res.data;

      // Step 2: upload image if provided
      if (uploadFile) {
        setUploadProgress("กำลังอัปโหลดรูปภาพ…");
        const fd = new FormData();
        fd.append("file", uploadFile);
        const uploadRes = await api.post(`/products/${product.id}/upload`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        product.media_urls = [uploadRes.data.url];
      }

      setProducts((prev) => [product, ...prev]);
      setForm(EMPTY);
      clearFile();
      setShowForm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("ลบสินค้านี้?")) return;
    await api.delete(`/products/${id}`);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAnalyze = async (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalyzing(productId);
    try {
      await api.post(`/products/${productId}/analyze`);
      router.push("/generate");
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(null);
    }
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-enter" style={{ padding: "32px 40px", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
          02 · สินค้า
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>สินค้า</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dim)" }}>
              อัปโหลดสินค้า · วิเคราะห์ด้วย AI · สร้างวิดีโอ
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <Search size={14} color="var(--faint)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="cs-input"
                placeholder="ค้นหาสินค้า…"
                style={{ paddingLeft: 34, width: 200 }}
              />
            </div>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={14} strokeWidth={3} />
              เพิ่มสินค้า
            </button>
          </div>
        </div>
      </div>

      {/* Add Product Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => !submitting && setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>เพิ่มสินค้าใหม่</h2>
              {!submitting && <button className="icon-btn" onClick={() => setShowForm(false)}><X size={14} /></button>}
            </div>

            {/* Dropzone */}
            {!previewUrl ? (
              <div
                {...getRootProps()}
                className={`upload-zone${isDragActive ? " drag-over" : ""}`}
                style={{ marginBottom: 16 }}
              >
                <input {...getInputProps()} />
                <ImgIcon size={28} color="var(--faint)" style={{ margin: "0 auto 10px", display: "block" }} />
                <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--dim)", fontWeight: 600 }}>
                  {isDragActive ? "วางรูปที่นี่…" : "ลากรูปภาพมาวาง หรือคลิกเลือก"}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>PNG, JPG, WEBP ขนาดสูงสุด 10MB (ไม่บังคับ)</p>
              </div>
            ) : (
              <div style={{ marginBottom: 16, position: "relative" }}>
                <img src={previewUrl} alt="preview" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 12, border: "1px solid var(--gb)" }} />
                <button
                  className="icon-btn"
                  onClick={clearFile}
                  style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }}
                >
                  <X size={12} />
                </button>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ok)", fontWeight: 700 }}>✓ {uploadFile?.name}</p>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>ชื่อสินค้า *</label>
                <input
                  className="cs-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ชื่อสินค้า"
                  autoFocus
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>คำอธิบาย</label>
                <textarea
                  className="cs-input"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="คำอธิบายสินค้า…"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>หมวดหมู่</label>
                  <input
                    className="cs-input"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="เช่น บ้านพักวิลลา, รีสอร์ต"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>ราคา (บาท)</label>
                  <input
                    className="cs-input"
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {uploadProgress && (
              <div style={{ margin: "14px 0 0", padding: "10px 14px", background: "rgba(0,255,212,.06)", border: "1px solid rgba(0,255,212,.2)", borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader2 size={14} color="var(--teal)" style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 12.5, color: "var(--teal)", fontWeight: 600 }}>{uploadProgress}</span>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)} disabled={submitting}>
                ยกเลิก
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={handleCreate}
                disabled={submitting || !form.name.trim()}
              >
                {submitting
                  ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />กำลังบันทึก…</>
                  : "บันทึก"
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 200, background: "var(--glass)", borderRadius: 16, border: "1px solid var(--gb)", opacity: .5 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <Package size={52} strokeWidth={1} style={{ margin: "0 auto 16px", display: "block", color: "var(--faint)", opacity: .3 }} />
          <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "var(--dim)" }}>
            {search ? "ไม่พบสินค้าที่ค้นหา" : "ยังไม่มีสินค้า"}
          </p>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--faint)" }}>
            {search ? "ลองค้นหาคำอื่น" : "กดปุ่ม เพิ่มสินค้า เพื่อเริ่มต้น"}
          </p>
          {!search && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={14} />เพิ่มสินค้าแรก
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {filtered.map((p) => {
            const imgSrc = p.media_urls?.length > 0 ? fileUrl(p.media_urls[0]) : null;
            return (
              <div key={p.id} className="card" style={{ cursor: "pointer", padding: 0, overflow: "hidden" }}>

                {/* Image area */}
                <div
                  onClick={() => router.push(`/generate`)}
                  style={{
                    height: 150, overflow: "hidden", position: "relative",
                    background: "linear-gradient(135deg, rgba(0,255,212,.06), rgba(77,127,255,.06))",
                    borderBottom: "1px solid var(--gb)",
                  }}
                >
                  {imgSrc ? (
                    <img src={imgSrc} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Package size={36} color="var(--faint)" strokeWidth={1} style={{ opacity: .4 }} />
                    </div>
                  )}
                  {/* Delete button */}
                  <button
                    className="icon-btn"
                    onClick={(e) => handleDelete(p.id, e)}
                    style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", opacity: 0, transition: "opacity .2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "0"}
                  >
                    <Trash2 size={12} color="var(--err)" />
                  </button>
                </div>

                {/* Info */}
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {p.name}
                    </h3>
                    {p.price && (
                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--teal)", flexShrink: 0 }}>
                        ฿{p.price.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {p.category && (
                    <span style={{
                      display: "inline-block", fontSize: 10.5, fontWeight: 700,
                      color: "var(--purple)", background: "rgba(155,111,255,.12)",
                      border: "1px solid rgba(155,111,255,.2)",
                      padding: "2px 9px", borderRadius: 20, marginBottom: 8,
                    }}>{p.category}</span>
                  )}

                  {p.description && (
                    <p style={{
                      margin: "0 0 10px", fontSize: 12, color: "var(--faint)", lineHeight: 1.5,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>{p.description}</p>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn btn-soft btn-sm"
                      style={{ flex: 1, justifyContent: "center" }}
                      onClick={(e) => handleAnalyze(p.id, e)}
                      disabled={analyzing === p.id}
                    >
                      {analyzing === p.id
                        ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />วิเคราะห์…</>
                        : <><Zap size={12} />วิเคราะห์ AI</>
                      }
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: "center" }}
                      onClick={(e) => { e.stopPropagation(); router.push("/generate"); }}
                    >
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
