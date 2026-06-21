"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { api } from "@/lib/api";
import { Package, Upload, Plus, Loader2, X } from "lucide-react";

interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  media_urls: string[];
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "", price: "" });

  useEffect(() => {
    api.get("/products/").then((r) => {
      setProducts(r.data);
      setLoading(false);
    });
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post("/products/", {
        name: form.name,
        description: form.description || null,
        category: form.category || null,
        price: form.price ? parseFloat(form.price) : null,
      });
      setProducts((prev) => [res.data, ...prev]);
      setForm({ name: "", description: "", category: "", price: "" });
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สินค้า</h1>
          <p className="text-gray-500 mt-1">จัดการสินค้าที่ต้องการสร้างวิดีโอ</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          เพิ่มสินค้า
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">เพิ่มสินค้าใหม่</h2>
              <button onClick={() => setShowForm(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="ชื่อสินค้า"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">คำอธิบาย</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="คำอธิบายสินค้า..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="เช่น เสื้อผ้า, อาหาร"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ราคา (บาท)</label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !form.name.trim()}
                className="flex-1 bg-violet-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition disabled:opacity-60"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>ยังไม่มีสินค้า กดปุ่ม "เพิ่มสินค้า" เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <div
              key={p.id}
              onClick={() => router.push(`/products/${p.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:border-violet-300 hover:shadow-sm transition group"
            >
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-violet-200 transition">
                <Package className="w-5 h-5 text-violet-600" />
              </div>
              <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
              {p.category && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mt-1 inline-block">{p.category}</span>}
              {p.description && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{p.description}</p>}
              {p.price && <p className="text-sm font-medium text-violet-600 mt-2">฿{p.price.toLocaleString("th-TH")}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
