"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fileUrl } from "@/lib/api";
import { BrainCircuit, Loader2, RefreshCw, Package, Tag, Zap, Copy, Check, Sparkles, Users, Heart, Lightbulb, Star, ArrowRight } from "lucide-react";

interface Product {
  id: string; name: string; description: string | null;
  category: string | null; price: number | null; media_urls: string[];
}

interface AnalysisResult {
  analysis_id?: string;
  key_features: string[];
  selling_points: string[];
  target_audience: string;
  mood: string;
  suggested_hooks: string[];
  model_used?: string;
  tokens_used?: number;
  created_at?: string;
}

function fmtPrice(p: number | null) {
  if (!p) return "—";
  return p.toLocaleString("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
}

function CopyPill({ text, color = "var(--dim)", bg = "rgba(255,255,255,.04)", border = "rgba(255,255,255,.1)" }: { text: string; color?: string; bg?: string; border?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      // fallback for older browsers
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button onClick={copy} title={`คัดลอก: ${text}`} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
      borderRadius: 20, cursor: "pointer", transition: "all .15s",
      fontSize: 12, fontWeight: 600,
      border: `1px solid ${copied ? "rgba(34,212,153,.5)" : border}`,
      background: copied ? "rgba(34,212,153,.15)" : bg,
      color: copied ? "var(--ok)" : color,
      boxShadow: copied ? "0 0 12px rgba(34,212,153,.2)" : "none",
    }}>
      {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} />}
      {text.length > 55 ? text.slice(0, 55) + "…" : text}
    </button>
  );
}

export default function AnalysisPage() {
  const router = useRouter();
  const [products, setProducts]   = useState<Product[]>([]);
  const [analyses, setAnalyses]   = useState<Record<string, AnalysisResult>>({});
  const [loading, setLoading]     = useState(true);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);

  useEffect(() => {
    api.get("/products/").then(async r => {
      const prods: Product[] = r.data;
      setProducts(prods);
      // Load latest analysis for each product in parallel
      const results = await Promise.allSettled(
        prods.map(p => api.get(`/products/${p.id}/analysis`))
      );
      const map: Record<string, AnalysisResult> = {};
      results.forEach((res, i) => {
        if (res.status === "fulfilled" && res.value.data?.analysis_id) {
          map[prods[i].id] = res.value.data;
        }
      });
      setAnalyses(map);
    }).finally(() => setLoading(false));
  }, []);

  const runAnalysis = async (id: string) => {
    setAnalyzing(id);
    try {
      const r = await api.post(`/products/${id}/analyze`);
      setAnalyses(prev => ({ ...prev, [id]: r.data }));
      setExpanded(id);
    } catch { /* ignore */ }
    setAnalyzing(null);
  };

  const analyzed = products.filter(p => analyses[p.id]);
  const pending  = products.filter(p => !analyses[p.id]);

  return (
    <div className="page-enter" style={{ padding: "32px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        03 · ผลวิเคราะห์
      </p>
      <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>ผลวิเคราะห์ AI</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>
        AI วิเคราะห์สินค้าเพื่อสกัด Hooks · Selling Points · กลุ่มเป้าหมาย
      </p>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "สินค้าทั้งหมด",  val: products.length, c: "var(--teal)", bg: "rgba(0,255,212,.1)"  },
          { label: "วิเคราะห์แล้ว",  val: analyzed.length, c: "var(--ok)",   bg: "rgba(34,212,153,.1)" },
          { label: "รอวิเคราะห์",    val: pending.length,  c: "var(--warn)", bg: "rgba(255,176,46,.1)" },
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
          กำลังโหลดผลวิเคราะห์…
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Package size={40} strokeWidth={1} style={{ margin: "0 auto 12px", display: "block", opacity: .3 }} />
          <p style={{ fontSize: 14, color: "var(--dim)", margin: "0 0 6px" }}>ยังไม่มีสินค้า</p>
          <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>อัปโหลดสินค้าในหน้า สินค้า ก่อน</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {products.map(p => {
            const isOpen      = expanded === p.id;
            const isAnalyzing = analyzing === p.id;
            const result      = analyses[p.id] || null;

            return (
              <div key={p.id} style={{
                background: "var(--glass)", border: `1px solid ${isOpen ? "rgba(0,255,212,.25)" : result ? "rgba(34,212,153,.1)" : "var(--gb)"}`,
                borderRadius: 14, overflow: "hidden", transition: "border-color .15s",
              }}>
                {/* Header */}
                <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                  {p.media_urls?.[0] ? (
                    <img src={fileUrl(p.media_urls[0])} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Package size={20} style={{ opacity: .3 }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2, display: "flex", gap: 10 }}>
                      {p.category && <span><Tag size={9} style={{ verticalAlign: "middle", marginRight: 3 }} />{p.category}</span>}
                      <span>{fmtPrice(p.price)}</span>
                      {result?.created_at && (
                        <span>วิเคราะห์ {new Date(result.created_at).toLocaleDateString("th-TH")}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {result ? (
                      <button onClick={() => setExpanded(isOpen ? null : p.id)} style={{
                        fontSize: 11, fontWeight: 700, color: "var(--ok)", background: "rgba(34,212,153,.1)",
                        border: "1px solid rgba(34,212,153,.25)", padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <BrainCircuit size={11} /> {isOpen ? "ซ่อนผล" : "ดูผล"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warn)", background: "rgba(255,176,46,.1)", border: "1px solid rgba(255,176,46,.25)", padding: "3px 10px", borderRadius: 6 }}>
                        รอวิเคราะห์
                      </span>
                    )}
                    <button onClick={() => runAnalysis(p.id)} disabled={isAnalyzing} style={{
                      padding: "7px 14px", borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: isAnalyzing ? "not-allowed" : "pointer",
                      border: "none", background: isAnalyzing ? "var(--glass2)" : "linear-gradient(90deg,var(--teal),var(--blue))",
                      color: isAnalyzing ? "var(--faint)" : "#06060A", display: "flex", alignItems: "center", gap: 5,
                    }}>
                      {isAnalyzing
                        ? <><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> กำลังวิเคราะห์…</>
                        : <><RefreshCw size={11} /> {result ? "วิเคราะห์ใหม่" : "วิเคราะห์"}</>}
                    </button>
                  </div>
                </div>

                {/* Expanded analysis */}
                {isOpen && result && (
                  <div style={{ borderTop: "1px solid var(--gb)", padding: "20px 18px" }}>

                    {/* Top row: audience + mood */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                      <div style={{ background: "rgba(77,127,255,.06)", border: "1px solid rgba(77,127,255,.15)", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                          <Users size={13} color="var(--blue)" />
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--blue)" }}>กลุ่มเป้าหมาย</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{result.target_audience || "—"}</p>
                      </div>
                      <div style={{ background: "rgba(168,85,247,.06)", border: "1px solid rgba(168,85,247,.15)", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                          <Heart size={13} color="var(--purple)" />
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--purple)" }}>Mood & Tone</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{result.mood || "—"}</p>
                      </div>
                    </div>

                    {/* Selling points */}
                    {result.selling_points?.length > 0 && (
                      <div style={{ background: "rgba(0,255,212,.04)", border: "1px solid rgba(0,255,212,.12)", borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                          <Star size={13} color="var(--teal)" />
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--teal)" }}>Selling Points</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                          {result.selling_points.map((sp, i) => (
                            <CopyPill key={i} text={sp} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key features */}
                    {result.key_features?.length > 0 && (
                      <div style={{ background: "rgba(34,212,153,.04)", border: "1px solid rgba(34,212,153,.1)", borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                          <Zap size={13} color="var(--ok)" />
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ok)" }}>Key Features (คลิกเพื่อคัดลอก)</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                          {result.key_features.map((f, i) => (
                            <CopyPill key={i} text={f} color="var(--ok)" bg="rgba(34,212,153,.08)" border="rgba(34,212,153,.25)" />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggested hooks */}
                    {result.suggested_hooks?.length > 0 && (
                      <div style={{ background: "rgba(255,176,46,.04)", border: "1px solid rgba(255,176,46,.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <Lightbulb size={13} color="var(--warn)" />
                            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--warn)" }}>Suggested Hooks (คลิกเพื่อคัดลอก)</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {result.suggested_hooks.map((hook, i) => (
                            <CopyPill key={i} text={hook} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CTA: use in generate */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => router.push("/generate")} style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "9px 18px", borderRadius: 10, cursor: "pointer",
                        background: "linear-gradient(90deg,var(--teal),var(--blue))",
                        border: "none", color: "#06060A", fontSize: 12.5, fontWeight: 800,
                      }}>
                        <Sparkles size={13} /> สร้างคลิปจากสินค้านี้ <ArrowRight size={12} />
                      </button>
                      {result.tokens_used && (
                        <span style={{ fontSize: 11, color: "var(--faint)", display: "flex", alignItems: "center" }}>
                          {result.tokens_used.toLocaleString()} tokens · {result.model_used}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
