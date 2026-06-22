"use client";

import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { BrainCircuit, Loader2, RefreshCw, Package, Tag, ChevronDown, ChevronUp, Zap } from "lucide-react";

interface Product {
  id: string; name: string; description: string | null;
  category: string | null; price: number | null;
  media_urls: string[]; analysis_result: Record<string, unknown> | null;
}

function fmtPrice(p: number | null) {
  if (!p) return "—";
  return p.toLocaleString("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
}

export default function AnalysisPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data)).finally(() => setLoading(false));
  }, []);

  const runAnalysis = async (id: string) => {
    setAnalyzing(id);
    try {
      const r = await api.post(`/products/${id}/analyze`);
      setProducts(prev => prev.map(p => p.id === id ? { ...p, analysis_result: r.data } : p));
    } catch { /* ignore */ }
    setAnalyzing(false as unknown as string);
    setAnalyzing(null);
  };

  const analyzed = products.filter(p => p.analysis_result);
  const pending  = products.filter(p => !p.analysis_result);

  return (
    <div className="page-enter" style={{ padding: "32px 40px", maxWidth: 900, margin: "0 auto" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        03 · ผลวิเคราะห์
      </p>
      <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>ผลวิเคราะห์ AI</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>
        AI วิเคราะห์สินค้าของคุณเพื่อสร้าง script ที่ตรงกลุ่มเป้าหมาย
      </p>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "สินค้าทั้งหมด",   val: products.length, c: "var(--teal)",   bg: "rgba(0,255,212,.1)"  },
          { label: "วิเคราะห์แล้ว",   val: analyzed.length, c: "var(--ok)",    bg: "rgba(34,212,153,.1)" },
          { label: "รอวิเคราะห์",     val: pending.length,  c: "var(--warn)",  bg: "rgba(255,176,46,.1)" },
        ].map(({ label, val, c, bg }) => (
          <div key={label} style={{ padding: "16px 18px", background: bg, border: `1px solid ${c}33`, borderRadius: 14 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--faint)", letterSpacing: ".06em" }}>{label}</p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: c }}>{loading ? "—" : val}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--faint)" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px", display: "block" }} />
          กำลังโหลด…
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Package size={40} strokeWidth={1} style={{ margin: "0 auto 12px", display: "block", opacity: .3 }} />
          <p style={{ fontSize: 14, color: "var(--dim)", margin: "0 0 6px" }}>ยังไม่มีสินค้า</p>
          <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>อัปโหลดสินค้าก่อนในหน้า สินค้า</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {products.map(p => {
            const isOpen     = expanded === p.id;
            const isAnalyzing = analyzing === p.id;
            const result     = p.analysis_result as Record<string, string> | null;

            return (
              <div key={p.id} style={{
                background: "var(--glass)", border: `1px solid ${isOpen ? "rgba(0,255,212,.2)" : "var(--gb)"}`,
                borderRadius: 14, overflow: "hidden", transition: "border-color .15s",
              }}>
                {/* Header */}
                <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                  {p.media_urls?.[0] && (
                    <img src={fileUrl(p.media_urls[0])} alt="" style={{ width: 44, height: 44, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2, display: "flex", gap: 10 }}>
                      {p.category && <span><Tag size={9} style={{ verticalAlign: "middle", marginRight: 3 }} />{p.category}</span>}
                      <span>{fmtPrice(p.price)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {result ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ok)", background: "rgba(34,212,153,.1)", border: "1px solid rgba(34,212,153,.25)", padding: "3px 10px", borderRadius: 6 }}>
                        ✓ วิเคราะห์แล้ว
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warn)", background: "rgba(255,176,46,.1)", border: "1px solid rgba(255,176,46,.25)", padding: "3px 10px", borderRadius: 6 }}>
                        รอวิเคราะห์
                      </span>
                    )}
                    <button
                      onClick={() => runAnalysis(p.id)}
                      disabled={isAnalyzing}
                      style={{
                        padding: "7px 14px", borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: isAnalyzing ? "not-allowed" : "pointer",
                        border: "none", background: isAnalyzing ? "var(--glass2)" : "linear-gradient(90deg,var(--teal),var(--blue))",
                        color: isAnalyzing ? "var(--faint)" : "#06060A", display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      {isAnalyzing
                        ? <><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> กำลังวิเคราะห์…</>
                        : <><RefreshCw size={11} /> {result ? "วิเคราะห์ใหม่" : "วิเคราะห์"}</>}
                    </button>
                    {result && (
                      <button onClick={() => setExpanded(isOpen ? null : p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", display: "flex" }}>
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Analysis result */}
                {isOpen && result && (
                  <div style={{ borderTop: "1px solid var(--gb)", padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <BrainCircuit size={15} color="var(--teal)" />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>ผลวิเคราะห์จาก AI</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {Object.entries(result).filter(([k]) => typeof result[k] === "string").map(([key, val]) => (
                        <div key={key} style={{ background: "var(--bg)", border: "1px solid var(--gb)", borderRadius: 11, padding: "12px 14px" }}>
                          <p style={{ margin: "0 0 5px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                            {key.replace(/_/g, " ")}
                          </p>
                          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text)", lineHeight: 1.6 }}>{String(val)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AI tip */}
      <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(0,255,212,.04)", border: "1px solid rgba(0,255,212,.12)", borderRadius: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Zap size={15} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
          AI จะวิเคราะห์ชื่อสินค้า รูปภาพ และคำอธิบาย เพื่อระบุกลุ่มเป้าหมาย จุดขาย และ tone ที่เหมาะสมสำหรับ TikTok
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
