"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api, fileUrl } from "@/lib/api";
import { Package, Plus, X, Loader2, Search, Zap, Image as ImgIcon, Trash2, ArrowRight, Pencil, SlidersHorizontal, Check, FolderOpen } from "lucide-react";
import { useDropzone } from "react-dropzone";

interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  media_urls: string[];
}

interface AssetItem { id: string; url: string; name: string; mime_type: string | null; }

function AssetPickerModal({ onSelect, onClose }: { onSelect: (urls: string[]) => void; onClose: () => void }) {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get("/assets/?asset_type=image")
      .then(r => setAssets((r.data as AssetItem[]).filter(a => a.mime_type?.startsWith("image/"))))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (url: string) => setSelected(prev => {
    const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620, width: "92vw" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>เลือกจาก Asset Library</h2>
          <button className="icon-btn" onClick={onClose}><X size={14} /></button>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--faint)" }}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px", display: "block" }} />กำลังโหลด...
          </div>
        ) : assets.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--faint)", fontSize: 13 }}>
            ยังไม่มีรูปใน Asset Library — อัปโหลดก่อนที่หน้า Asset Library
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, maxHeight: 360, overflowY: "auto", marginBottom: 16, padding: 2 }}>
            {assets.map(a => {
              const sel = selected.has(a.url);
              return (
                <div key={a.id} onClick={() => toggle(a.url)} style={{
                  position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", cursor: "pointer",
                  border: `2px solid ${sel ? "var(--teal)" : "transparent"}`, transition: "border-color .12s",
                }}>
                  <img src={fileUrl(a.url)} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {sel && (
                    <div style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, background: "var(--teal)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Check size={11} color="#06060A" strokeWidth={3} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => { onSelect([...selected]); onClose(); }} disabled={selected.size === 0}>
            เลือก {selected.size > 0 ? `${selected.size} รูป` : "รูป"}
          </button>
        </div>
      </div>
    </div>
  );
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

  // ── Asset picker state ───────────────────────────────────────────
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetPickerFor, setAssetPickerFor]   = useState<"add" | "edit">("add");

  // ── Add modal state ──────────────────────────────────────────────
  const [showAdd, setShowAdd]               = useState(false);
  const [addForm, setAddForm]               = useState<Form>(EMPTY);
  const [addFiles, setAddFiles]             = useState<File[]>([]);
  const [addPreviews, setAddPreviews]       = useState<string[]>([]);
  const [addLibraryUrls, setAddLibraryUrls] = useState<string[]>([]);
  const [addBusy, setAddBusy]               = useState(false);
  const [addProgress, setAddProgress]       = useState<string | null>(null);

  // ── Edit modal state ─────────────────────────────────────────────
  const [editProduct, setEditProduct]           = useState<Product | null>(null);
  const [editForm, setEditForm]                 = useState<Form>(EMPTY);
  const [editExistingUrls, setEditExistingUrls] = useState<string[]>([]);
  const [editNewFiles, setEditNewFiles]         = useState<File[]>([]);
  const [editNewPreviews, setEditNewPreviews]   = useState<string[]>([]);
  const [editBusy, setEditBusy]                 = useState(false);
  const [editProgress, setEditProgress]         = useState<string | null>(null);

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // ── Add dropzone (multiple) ───────────────────────────────────────
  const onAddDrop = useCallback((newFiles: File[]) => {
    const newPreviews = newFiles.map(f => URL.createObjectURL(f));
    setAddFiles(prev => [...prev, ...newFiles].slice(0, 8));
    setAddPreviews(prev => {
      const all = [...prev, ...newPreviews];
      all.slice(8).forEach(u => URL.revokeObjectURL(u));
      return all.slice(0, 8);
    });
  }, []);
  const { getRootProps: addRoot, getInputProps: addInput, isDragActive: addDrag } = useDropzone({
    onDrop: onAddDrop, accept: { "image/*": [] }, maxFiles: 8, maxSize: 10 * 1024 * 1024, multiple: true,
  });
  const removeAddFile = (i: number) => {
    URL.revokeObjectURL(addPreviews[i]);
    setAddFiles(prev => prev.filter((_, j) => j !== i));
    setAddPreviews(prev => prev.filter((_, j) => j !== i));
  };
  const clearAdd = () => {
    addPreviews.forEach(u => URL.revokeObjectURL(u));
    setAddFiles([]); setAddPreviews([]); setAddLibraryUrls([]);
  };

  const handleAssetSelect = (urls: string[]) => {
    if (assetPickerFor === "add") {
      setAddLibraryUrls(prev => {
        const merged = [...prev, ...urls.filter(u => !prev.includes(u))];
        return merged.slice(0, Math.max(0, 8 - addFiles.length));
      });
    } else {
      setEditExistingUrls(prev => {
        const merged = [...prev, ...urls.filter(u => !prev.includes(u))];
        return merged.slice(0, Math.max(0, 8 - editNewFiles.length));
      });
    }
  };

  // ── Edit dropzone (multiple) ──────────────────────────────────────
  const onEditDrop = useCallback((newFiles: File[]) => {
    const newPreviews = newFiles.map(f => URL.createObjectURL(f));
    setEditNewFiles(prev => [...prev, ...newFiles].slice(0, 8));
    setEditNewPreviews(prev => {
      const all = [...prev, ...newPreviews];
      all.slice(8).forEach(u => URL.revokeObjectURL(u));
      return all.slice(0, 8);
    });
  }, []);
  const { getRootProps: editRoot, getInputProps: editInput, isDragActive: editDrag } = useDropzone({
    onDrop: onEditDrop, accept: { "image/*": [] }, multiple: true, maxFiles: 8, maxSize: 10 * 1024 * 1024,
  });

  const removeExisting = (i: number) => setEditExistingUrls(prev => prev.filter((_, j) => j !== i));
  const removeEditNew = (i: number) => {
    URL.revokeObjectURL(editNewPreviews[i]);
    setEditNewFiles(prev => prev.filter((_, j) => j !== i));
    setEditNewPreviews(prev => prev.filter((_, j) => j !== i));
  };

  const openEdit = (p: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditProduct(p);
    setEditForm({ name: p.name, description: p.description || "", category: p.category || "", price: p.price != null ? String(p.price) : "" });
    setEditExistingUrls(p.media_urls || []);
    setEditNewFiles([]); setEditNewPreviews([]);
  };
  const closeEdit = () => {
    editNewPreviews.forEach(u => URL.revokeObjectURL(u));
    setEditProduct(null);
    setEditExistingUrls([]); setEditNewFiles([]); setEditNewPreviews([]);
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
      if (addFiles.length > 0) {
        for (let i = 0; i < addFiles.length; i++) {
          setAddProgress(`กำลังอัปโหลดรูป ${i + 1}/${addFiles.length}…`);
          const fd = new FormData(); fd.append("file", addFiles[i]);
          const up = await api.post(`/products/${product.id}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
          if (i === 0) product.media_urls = [up.data.url];
          else product.media_urls = [...product.media_urls, up.data.url];
        }
      }
      if (addLibraryUrls.length > 0) {
        setAddProgress("กำลังบันทึกรูปจาก Library…");
        const merged = [...(product.media_urls || []), ...addLibraryUrls];
        const r = await api.patch(`/products/${product.id}`, { media_urls: merged });
        product.media_urls = r.data.media_urls ?? merged;
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
      let media_urls = [...editExistingUrls];
      for (let i = 0; i < editNewFiles.length; i++) {
        setEditProgress(`กำลังอัปโหลดรูป ${i + 1}/${editNewFiles.length}…`);
        const fd = new FormData(); fd.append("file", editNewFiles[i]);
        const up = await api.post(`/products/${editProduct.id}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        media_urls = [...media_urls, up.data.url];
      }
      const res = await api.patch(`/products/${editProduct.id}`, {
        name: editForm.name, description: editForm.description || null,
        category: editForm.category || null, price: editForm.price ? parseFloat(editForm.price) : null,
        media_urls,
      });
      setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...p, ...res.data } : p));
      closeEdit();
    } catch (e) { console.error(e); }
    finally { setEditBusy(false); setEditProgress(null); }
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

  const editTotalImages = editExistingUrls.length + editNewPreviews.length;

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
                padding: "5px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${catFilter === key ? "rgba(0,255,212,.4)" : "var(--gb)"}`,
                background: catFilter === key ? "rgba(0,255,212,.12)" : "var(--glass)",
                color: catFilter === key ? "var(--teal)" : "var(--dim)", transition: "all .15s",
              }}>{label}</button>
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

            {/* Image upload — multiple (up to 8) */}
            {(() => {
              const addTotal = addPreviews.length + addLibraryUrls.length;
              return (
                <div style={{ marginBottom: 16 }}>
                  {(addPreviews.length > 0 || addLibraryUrls.length > 0) && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                      {addPreviews.map((src, i) => (
                        <div key={`file-${i}`} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1px solid var(--gb)" }}>
                          <img src={src} alt={`รูป ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <button onClick={() => removeAddFile(i)} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, padding: 0, border: "none", borderRadius: 5, cursor: "pointer", background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                      {addLibraryUrls.map((url, i) => (
                        <div key={`lib-${i}`} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(0,255,212,.35)" }}>
                          <img src={fileUrl(url)} alt={`library ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <div style={{ position: "absolute", bottom: 3, left: 3, fontSize: 9, background: "rgba(0,255,212,.8)", color: "#000", borderRadius: 3, padding: "1px 4px", fontWeight: 800 }}>LIB</div>
                          <button onClick={() => setAddLibraryUrls(p => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, padding: 0, border: "none", borderRadius: 5, cursor: "pointer", background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {addTotal < 8 && (
                    <div {...addRoot()} className={`upload-zone${addDrag ? " drag-over" : ""}`} style={addTotal > 0 ? { padding: "14px 16px" } : {}}>
                      <input {...addInput()} />
                      <ImgIcon size={addTotal > 0 ? 18 : 28} color="var(--faint)" style={{ margin: "0 auto 6px", display: "block" }} />
                      <p style={{ margin: "0 0 4px", fontSize: addTotal > 0 ? 11 : 13, color: "var(--dim)", fontWeight: 600 }}>
                        {addDrag ? "วางรูปที่นี่…" : addTotal > 0 ? `+ เพิ่มรูปได้อีก ${8 - addTotal} รูป` : "ลากรูปมาวาง หรือคลิกเลือก"}
                      </p>
                      {addTotal === 0 && <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>PNG, JPG, WEBP สูงสุด 10MB · ใส่ได้สูงสุด 8 รูป</p>}
                    </div>
                  )}
                  {addTotal < 8 && (
                    <button onClick={() => { setAssetPickerFor("add"); setShowAssetPicker(true); }} style={{
                      marginTop: 8, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      padding: "9px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                      border: "1px solid rgba(0,255,212,.25)", background: "rgba(0,255,212,.05)", color: "var(--teal)",
                    }}>
                      <FolderOpen size={14} /> เลือกจาก Asset Library
                    </button>
                  )}
                </div>
              );
            })()}

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

            {/* Edit image area — multi-image */}
            <div style={{ marginBottom: 16 }}>
              {editExistingUrls.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                  {editExistingUrls.map((url, i) => (
                    <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1px solid var(--gb)" }}>
                      <img src={fileUrl(url)} alt={`รูป ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button onClick={() => removeExisting(i)} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, padding: 0, border: "none", borderRadius: 5, cursor: "pointer", background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {editNewPreviews.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                  {editNewPreviews.map((src, i) => (
                    <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(0,255,212,.35)" }}>
                      <img src={src} alt={`ใหม่ ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button onClick={() => removeEditNew(i)} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, padding: 0, border: "none", borderRadius: 5, cursor: "pointer", background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {editTotalImages < 8 && (
                <div {...editRoot()} className={`upload-zone${editDrag ? " drag-over" : ""}`} style={editTotalImages > 0 ? { padding: "14px 16px" } : {}}>
                  <input {...editInput()} />
                  <ImgIcon size={editTotalImages > 0 ? 18 : 28} color="var(--faint)" style={{ margin: "0 auto 6px", display: "block" }} />
                  <p style={{ margin: "0 0 4px", fontSize: editTotalImages > 0 ? 11 : 13, color: "var(--dim)", fontWeight: 600 }}>
                    {editDrag ? "วางรูปที่นี่…" : editTotalImages > 0 ? `+ เพิ่มรูปได้อีก ${8 - editTotalImages} รูป` : "ลากรูปมาวาง หรือคลิกเลือก"}
                  </p>
                  {editTotalImages === 0 && <p style={{ margin: 0, fontSize: 11, color: "var(--faint)" }}>PNG, JPG, WEBP สูงสุด 10MB · ใส่ได้สูงสุด 8 รูป</p>}
                </div>
              )}
              {editTotalImages < 8 && (
                <button onClick={() => { setAssetPickerFor("edit"); setShowAssetPicker(true); }} style={{
                  marginTop: 8, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  padding: "9px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                  border: "1px solid rgba(0,255,212,.25)", background: "rgba(0,255,212,.05)", color: "var(--teal)",
                }}>
                  <FolderOpen size={14} /> เลือกจาก Asset Library
                </button>
              )}
              {editProgress && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(0,255,212,.06)", border: "1px solid rgba(0,255,212,.2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader2 size={12} color="var(--teal)" style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 12, color: "var(--teal)", fontWeight: 600 }}>{editProgress}</span>
                </div>
              )}
            </div>

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
                  {p.media_urls?.length > 1 && (
                    <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)", borderRadius: 6, padding: "2px 8px", fontSize: 10.5, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                      <ImgIcon size={10} />{p.media_urls.length}
                    </div>
                  )}
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

      {showAssetPicker && (
        <AssetPickerModal
          onSelect={handleAssetSelect}
          onClose={() => setShowAssetPicker(false)}
        />
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
