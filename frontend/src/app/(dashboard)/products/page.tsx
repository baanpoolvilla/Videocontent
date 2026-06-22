"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api, fileUrl } from "@/lib/api";
import { Package, Plus, X, Loader2, Search, Zap, Image as ImgIcon, Trash2, ArrowRight, Pencil, SlidersHorizontal, Camera } from "lucide-react";
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
type SortKey = "newest" | "oldest" | "name_az" | "name_za" | "price_asc" | "price_desc";

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [catFilter, setCatFilter]   = useState("all");
  const [sort, setSort]             = useState<SortKey>("newest");
  const [analyzing, setAnalyzing]   = useState<string | null>(null);

  // ── Add modal state ──────────────────────────────────────────────
  const [showAdd, setShowAdd]         = useState(false);
  const [addForm, setAddForm]         = useState<Form>(EMPTY);
  const [addFile, setAddFile]         = useState<File | null>(null);
  const [addPreview, setAddPreview]   = useState("");
  const [addBusy, setAddBusy]         = useState(false);
  const [addProgress, setAddProgress] = useState<string | null>(null);

  // ── Edit modal state ─────────────────────────────────────────────
  const [editProduct, setEditProduct]       = useState<Product | null>(null);
  const [editForm, setEditForm]             = useState<Form>(EMPTY);
  const [editFile, setEditFile]             = useState<File | null>(null);
  const [editPreview, setEditPreview]       = useState("");
  const [editImgDeleted, setEditImgDeleted] = useState(false);
  const [editBusy, setEditBusy]             = useState(false);

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // ── Add dropzone ─────────────────────────────────────────────────
  const onAddDrop = useCallback((files: File[]) => {
    const f = files[0]; if (!f) return;
    setAddFile(f); setAddPreview(URL.createObjectURL(f));
  }, []);
  const { getRootProps: addRoot, getInputProps: addInput, isDragActive: addDrag } = useDropzone({
    onDrop: onAddDrop, accept: { "image/*": [] }, maxFiles: 1, maxSize: 10 * 1024 * 1024,
  });
  const clearAdd = () => {
    setAddFile(null); if (addPreview) { URL.revokeObjectURL(addPreview); setAddPreview(""); }
  };

  // ── Edit dropzone ─────────────────────────────────────────────────
  const onEditDrop = useCallback((files: File[]) => {
    const f = files[0]; if (!f) return;
    if (editPreview && !editProduct?.media_urls?.[0]) URL.revokeObjectURL(editPreview);
    setEditFile(f); setEditPreview(URL.createObjectURL(f)); setEditImgDeleted(false);
  }, [editPreview, editProduct]);
  const { getRootProps: editRoot, getInputProps: editInput, isDragActive: editDrag } = useDropzone({
    onDrop: onEditDrop, accept: { "image/*": [] }, maxFiles: 1, maxSize: 10 * 1024 * 1024,
  });

  const openEdit = (p: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditProduct(p);
    setEditForm({ name: p.name, description: p.description || "", category: p.category || "", price: p.price != null ? String(p.price) : "" });
    setEditFile(null); setEditPreview(""); setEditImgDeleted(false);
  };
  const closeEdit = () => {
    if (editPreview && !editProduct?.media_urls?.[0]) URL.revokeObjectURL(editPreview);
    setEditProduct(null); setEditFile(null); setEditPreview(""); setEditImgDeleted(false);
  };

  // ── Handlers ─────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.name.trim()) return;
    setAddBusy(true); setAddProgress("กำลังสร้างสินค้า…");
    try {
      const res = await api.post("/products/", {
        name: addForm.name, description: addForm.description || null,
        category: addForm.category || null, price: addForm.price ? parseFloat(addForm.price) : null,
      });
      const product: Product = res.data;
      if (addFile) {
        setAddProgress("กำลังอัปโหลดรูป…");
        const fd = new FormData(); fd.append("file", addFile);
        const up = await api.post(`/products/${product.id}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        product.media_urls = [up.data.url];
      }
      setProducts(prev => [product, ...prev]);
      setAddForm(EMPTY); clearAdd(); setShowAdd(false);
    } catch (e) { console.error(e); }
    finally { setAddBusy(false); setAddProgress(null); }
  };

  const handleEdit = async () => {
    if (!editProduct || !editForm.name.trim()) return;
    setEditBusy(true);
    try {
      let media_urls = editProduct.media_urls;

      if (editFile) {
        // Upload new image → get URL → replace media_urls
        const fd = new FormData(); fd.append("file", editFile);
        const up = await api.post(`/products/${editProduct.id}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        media_urls = [up.data.url];
      } else if (editImgDeleted) {
        media_urls = [];
      }

      const res = await api.patch(`/products/${editProduct.id}`, {
        name: editForm.name, description: editForm.description || null,
        category: editForm.category || null, price: editForm.price ? parseFloat(editForm.price) : null,
        media_urls,
      });
      setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...p, ...res.data } : p));
      closeEdit();
    } catch (e) { console.error(e); }
    finally { setEditBusy(false); }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("ลบสินค้านี้? ไม่สามารถย้อนกลับได้")) return;
    await api.delete(`/products/${id}`);
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleAnalyze = async (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalyzing(productId);
    try { await api.post(`/products/${productId}/analyze`); router.push("/generate"); }
    catch (err) { console.error(err); }
    finally { setAnalyzing(null); }
  };

  // ── Filter / sort ────────────────────────────────────────────────
  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))] as string[], [products]);

  const filtered = useMemo(() => {
    let list = products.filter(p => {
      const q = search.toLowerCase();
      return (p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q))
        && (catFilter === "all" || p.category === catFilter);
    });
    if (sort === "oldest")     list = [...list].reverse();
    if (sort === "name_az")    list = [...list].sort((a, b) => a.name.localeCompare(b.name, "th"));
    if (sort === "name_za")    list = [...list].sort((a, b) => b.name.localeCompare(a.name, "th"));
    if (sort === "price_asc")  list = [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    if (sort === "price_desc") list = [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    return list;
  }, [products, search, catFilter, sort]);

  // ── Current edit image display ────────────────────────────────────
  const editCurrentImg = (() => {
    if (editFile) return editPreview;           // new file chosen
    if (editImgDeleted) return null;            // user deleted
    if (editProduct?.media_urls?.[0]) return fileUrl(editProduct.media_urls[0]); // existing
    return null;
  })();

  return (
    <div className="page-enter" style={{ padding: "32px 40px", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>02 · สินค้า</p>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>สินค้า</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dim)" }}>อัปโหลดสินค้า · วิเคราะห์ด้วย AI · สร้างวิดีโอ</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={14} strokeWidth={3} />เพิ่มสินค้า
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <Search size={13} color="var(--faint)" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} className="cs-input" placeholder="ค้นหา…" style={{ paddingLeft: 32, width: 200 }} />
        </div>
        <div style={{ position: "relative" }}>
          <SlidersHorizontal size={12} color="var(--faint)" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="cs-select" style={{ paddingLeft: 30 }}>
            <option value="newest">ใหม่สุด</option>
            <option value="oldest">เก่าสุด</option>
            <option value="name_az">ชื่อ A–Z</option>
            <option value="name_za">ชื่อ Z–A</option>
            <option value="price_asc">ราคา น้อย→มาก</option>
            <option value="price_desc">ราคา มาก→น้อย</option>
          </select>
        </div>
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[{ key: "all", label: "ทั้งหมด" }, ...categories.map(c => ({ key: c, label: c }))].map(({ key, label }) => (
              <button key={key} onClick={() => setCatFilter(key)} style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: "none",
                border: `1px solid ${catFilter === key ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
                background: catFilter === key ? "rgba(0,255,212,.12)" : "var(--glass)",
                color: catFilter === key ? "var(--teal)" : "var(--dim)", transition: "all .15s",
              } as React.CSSProperties}>{label}</button>
            ))}
          </div>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--faint)" }}>{filtered.length} รายการ</span>
      </div>

      {/* ── ADD MODAL ─────────────────────────────────────────────── */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => !addBusy && setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>เพิ่มสินค้าใหม่</h2>
              {!addBusy && <button className="icon-btn" onClick={() => { setShowAdd(false); clearAdd(); }}><X size={14} /></button>}
            </div>

            {/* Image upload */}
            {!addPreview ? (
              <div {...addRoot()} className={`upload-zone${addDrag ? " drag-over" : ""}`} style={{ marginBottom: 16 }}>
                <input {...addInput()} />
                <ImgIcon size={28} color="var(--faint)" style={{ margin: "0 auto 10px", display: "block" }} />
                <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--dim)", fontWeight: 600 }}>{addDrag ? "วางรูปที่นี่…" : "ลากรูปมาวาง หรือคลิกเลือก"}</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>PNG, JPG, WEBP สูงสุด 10MB</p>
              </div>
            ) : (
              <div style={{ marginBottom: 16, position: "relative" }}>
                <img src={addPreview} alt="preview" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 12, border: "1px solid var(--gb)" }} />
                <button className="icon-btn" onClick={clearAdd} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.7)" }}><X size={12} /></button>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ok)", fontWeight: 700 }}>✓ {addFile?.name}</p>
              </div>
            )}

            <FormFields form={addForm} setForm={setAddForm} categories={categories} />

            {addProgress && (
              <div style={{ margin: "14px 0 0", padding: "10px 14px", background: "rgba(0,255,212,.06)", border: "1px solid rgba(0,255,212,.2)", borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <Loader2 size={14} color="var(--teal)" style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 12.5, color: "var(--teal)", fontWeight: 600 }}>{addProgress}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowAdd(false); clearAdd(); }} disabled={addBusy}>ยกเลิก</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={handleAdd} disabled={addBusy || !addForm.name.trim()}>
                {addBusy ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />บันทึก…</> : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ────────────────────────────────────────────── */}
      {editProduct && (
        <div className="modal-overlay" onClick={() => !editBusy && closeEdit()}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>แก้ไขสินค้า</h2>
              {!editBusy && <button className="icon-btn" onClick={closeEdit}><X size={14} /></button>}
            </div>

            {/* Edit image area */}
            {editCurrentImg ? (
              <div style={{ marginBottom: 16, position: "relative" }}>
                <img src={editCurrentImg} alt="product" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 12, border: "1px solid var(--gb)" }} />
                <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
                  <div {...editRoot()}>
                    <input {...editInput()} />
                    <button className="icon-btn" style={{ background: "rgba(0,0,0,.7)" }} title="เปลี่ยนรูป"><Camera size={12} /></button>
                  </div>
                  <button className="icon-btn" style={{ background: "rgba(0,0,0,.7)" }} onClick={() => { setEditImgDeleted(true); setEditFile(null); setEditPreview(""); }} title="ลบรูป">
                    <Trash2 size={12} color="var(--err)" />
                  </button>
                </div>
                {editFile && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ok)", fontWeight: 700 }}>✓ {editFile.name}</p>}
              </div>
            ) : (
              <div {...editRoot()} className={`upload-zone${editDrag ? " drag-over" : ""}`} style={{ marginBottom: 16 }}>
                <input {...editInput()} />
                <ImgIcon size={28} color="var(--faint)" style={{ margin: "0 auto 10px", display: "block" }} />
                <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--dim)", fontWeight: 600 }}>{editDrag ? "วางรูปที่นี่…" : "ลากรูปมาวาง หรือคลิกเลือก"}</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>PNG, JPG, WEBP สูงสุด 10MB</p>
              </div>
            )}

            <FormFields form={editForm} setForm={setEditForm} categories={categories} />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={closeEdit} disabled={editBusy}>ยกเลิก</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={handleEdit} disabled={editBusy || !editForm.name.trim()}>
                {editBusy ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />บันทึก…</> : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GRID ──────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {[...Array(6)].map((_, i) => <div key={i} style={{ height: 200, background: "var(--glass)", borderRadius: 16, border: "1px solid var(--gb)", opacity: .5 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <Package size={52} strokeWidth={1} style={{ margin: "0 auto 16px", display: "block", color: "var(--faint)", opacity: .3 }} />
          <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "var(--dim)" }}>{search || catFilter !== "all" ? "ไม่พบสินค้าที่ค้นหา" : "ยังไม่มีสินค้า"}</p>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--faint)" }}>{search || catFilter !== "all" ? "ลองเปลี่ยน filter" : "กดปุ่ม เพิ่มสินค้า เพื่อเริ่มต้น"}</p>
          {!search && catFilter === "all" && <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={14} />เพิ่มสินค้าแรก</button>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {filtered.map(p => {
            const imgSrc = p.media_urls?.length > 0 ? fileUrl(p.media_urls[0]) : null;
            return (
              <div key={p.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ height: 160, overflow: "hidden", position: "relative", background: "linear-gradient(135deg,rgba(0,255,212,.06),rgba(77,127,255,.06))", borderBottom: "1px solid var(--gb)" }}>
                  {imgSrc
                    ? <img src={imgSrc} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={36} color="var(--faint)" strokeWidth={1} style={{ opacity: .4 }} /></div>
                  }
                  <div className="img-actions">
                    <button className="icon-btn-sm" onClick={e => openEdit(p, e)} title="แก้ไข"><Pencil size={11} /></button>
                    <button className="icon-btn-sm danger" onClick={e => handleDelete(p.id, e)} title="ลบ"><Trash2 size={11} /></button>
                  </div>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</h3>
                    {p.price != null && <span style={{ fontSize: 13, fontWeight: 800, color: "var(--teal)", flexShrink: 0 }}>฿{p.price.toLocaleString()}</span>}
                  </div>
                  {p.category && <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, color: "var(--purple)", background: "rgba(155,111,255,.12)", border: "1px solid rgba(155,111,255,.2)", padding: "2px 9px", borderRadius: 20, marginBottom: 8 }}>{p.category}</span>}
                  {p.description && <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--faint)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.description}</p>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-soft btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={e => handleAnalyze(p.id, e)} disabled={analyzing === p.id}>
                      {analyzing === p.id ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />วิเคราะห์…</> : <><Zap size={12} />วิเคราะห์ AI</>}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); router.push("/generate"); }}><ArrowRight size={12} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .img-actions { position:absolute; top:8px; right:8px; display:flex; gap:5px; opacity:0; transition:opacity .2s; }
        .card:hover .img-actions { opacity:1; }
        .icon-btn-sm { width:28px; height:28px; border-radius:7px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.65); backdrop-filter:blur(6px); color:var(--text); transition:background .15s; }
        .icon-btn-sm:hover { background:rgba(0,0,0,.85); }
        .icon-btn-sm.danger:hover { background:rgba(255,77,106,.25); color:var(--err); }
      `}</style>
    </div>
  );
}

function FormFields({ form, setForm, categories }: { form: { name: string; description: string; category: string; price: string }; setForm: React.Dispatch<React.SetStateAction<{ name: string; description: string; category: string; price: string }>>; categories: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>ชื่อสินค้า *</label>
        <input className="cs-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ชื่อสินค้า" autoFocus />
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>คำอธิบาย</label>
        <textarea className="cs-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="คำอธิบายสินค้า…" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>หมวดหมู่</label>
          <input className="cs-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="เช่น วิลลา, สกินแคร์" list="cat-suggestions" />
          <datalist id="cat-suggestions">{categories.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 6 }}>ราคา (บาท)</label>
          <input className="cs-input" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0" />
        </div>
      </div>
    </div>
  );
}
