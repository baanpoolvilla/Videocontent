"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Package, Plus, X, Loader2, Search, Zap, Image as ImgIcon } from "lucide-react";
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

const CAT_COLORS: Record<string, string> = {
  "เสื้อผ้า": "var(--purple)", "อาหาร": "var(--warn)", "ท่องเที่ยว": "var(--teal)",
  "ความงาม": "var(--pink)", "อิเล็กทรอนิกส์": "var(--blue)",
};

function getCatColor(cat: string) {
  return CAT_COLORS[cat] || "var(--dim)";
}

export default function ProductsPage() {
  const router   = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [search, setSearch] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  useEffect(() => {
    api.get("/products/")
      .then((r) => setProducts(r.data))
      .finally(() => setLoading(false));
  }, []);

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) setUploadFile(files[0]);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "image/*": [] }, maxFiles: 1,
  });

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", form.name);
      if (form.description) formData.append("description", form.description);
      if (form.category)    formData.append("category",    form.category);
      if (form.price)       formData.append("price",       form.price);

      let res;
      if (uploadFile) {
        formData.append("file", uploadFile);
        res = await api.post("/products/", {
          name: form.name,
          description: form.description || null,
          category: form.category || null,
          price: form.price ? parseFloat(form.price) : null,
        });
        const productId = res.data.id;
        const fd = new FormData();
        fd.append("file", uploadFile);
        await api.post(`/products/${productId}/upload-image`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        }).catch(() => {});
      } else {
        res = await api.post("/products/", {
          name: form.name,
          description: form.description || null,
          category: form.category || null,
          price: form.price ? parseFloat(form.price) : null,
        });
      }
      setProducts((prev) => [res.data, ...prev]);
      setForm(EMPTY);
      setUploadFile(null);
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnalyze = async (productId: string) => {
    setAnalyzing(productId);
    try {
      await api.post(`/products/${productId}/analyze`);
      router.push("/generate");
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
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dim)" }}>อัปโหลดสินค้าและเริ่มสร้างคอนเทนต์ AI</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <Search size={14} color="var(--faint)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
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

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>เพิ่มสินค้าใหม่</h2>
              <button className="icon-btn" onClick={() => setShowForm(false)}><X size={14} /></button>
            </div>

            {/* Upload zone */}
            <div
              {...getRootProps()}
              className={`upload-zone${isDragActive ? " drag-over" : ""}`}
              style={{ marginBottom: 14 }}
            >
              <input {...getInputProps()} />
              {uploadFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ImgIcon size={20} color="var(--teal)" />
                  <span style={{ fontSize: 13, color: "var(--teal)", fontWeight: 600 }}>{uploadFile.name}</span>
                  <button
                    className="icon-btn btn-sm"
                    onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}
                    style={{ marginLeft: "auto" }}
                  ><X size={12} /></button>
                </div>
              ) : (
                <div>
                  <ImgIcon size={24} color="var(--faint)" style={{ margin: "0 auto 8px", display: "block" }} />
                  <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--dim)", fontWeight: 600 }}>
                    {isDragActive ? "วางรูปภาพที่นี่" : "ลากรูปภาพมาวาง หรือคลิกเลือก"}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>PNG, JPG, WEBP — ขนาดสูงสุด 10MB</p>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>ชื่อสินค้า *</label>
                <input className="cs-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="ชื่อสินค้า" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>คำอธิบาย</label>
                <textarea className="cs-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="คำอธิบายสินค้า…" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>หมวดหมู่</label>
                  <input className="cs-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="เช่น เสื้อผ้า, อาหาร" />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>ราคา (บาท)</label>
                  <input className="cs-input" type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreate} disabled={submitting || !form.name.trim()}>
                {submitting ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 160, background: "var(--glass)", borderRadius: 16, border: "1px solid var(--gb)", animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--faint)" }}>
          <Package size={48} strokeWidth={1} style={{ margin: "0 auto 14px", display: "block", opacity: .3 }} />
          <p style={{ margin: 0, fontSize: 14 }}>{search ? "ไม่พบสินค้าที่ค้นหา" : `ยังไม่มีสินค้า กดปุ่ม "เพิ่มสินค้า" เพื่อเริ่มต้น`}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {filtered.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{ cursor: "pointer", padding: 20 }}
              onClick={() => router.push(`/products/${p.id}`)}
            >
              {/* Image or placeholder */}
              <div style={{
                height: 130, borderRadius: 12, marginBottom: 14, overflow: "hidden",
                background: "linear-gradient(135deg, rgba(0,255,212,.06), rgba(77,127,255,.06))",
                border: "1px solid var(--gb)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {p.media_urls?.length > 0 ? (
                  <img src={p.media_urls[0]} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Package size={32} color="var(--faint)" strokeWidth={1} />
                )}
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </h3>
                  {p.category && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700,
                      color: getCatColor(p.category),
                      background: `${getCatColor(p.category)}18`,
                      padding: "2px 9px", borderRadius: 20, border: `1px solid ${getCatColor(p.category)}33`,
                      display: "inline-block",
                    }}>{p.category}</span>
                  )}
                  {p.description && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--faint)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {p.description}
                    </p>
                  )}
                  {p.price && (
                    <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 700, color: "var(--teal)" }}>
                      ฿{p.price.toLocaleString("th-TH")}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn btn-soft btn-sm"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => handleAnalyze(p.id)}
                  disabled={analyzing === p.id}
                >
                  {analyzing === p.id
                    ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                    : <><Zap size={13} />วิเคราะห์ AI</>
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
