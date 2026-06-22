"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Save, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, RefreshCw, Loader2, Copy, Check } from "lucide-react";

interface PromptTemplate {
  id: string; name: string; description: string | null;
  template_text: string; variables: string[] | null;
  is_active: boolean; version: number; created_at: string; updated_at: string;
}

const VARS = ["product_name", "product_description", "tone_of_voice", "target_audience", "cta_style", "selling_points", "hook", "brand_name"];

const DEFAULT_TEMPLATE = `คุณคือ copywriter มือโปรสำหรับที่พักพรีเมียม

สินค้า: {product_name}
รายละเอียด: {product_description}
Tone: {tone_of_voice}
กลุ่มเป้าหมาย: {target_audience}
CTA: {cta_style}

สร้าง script วิดีโอ 30-60 วินาที ประกอบด้วย:
- Hook (1-2 ประโยค ดึงดูดความสนใจ)
- Body (2-3 ประโยค บอก features เด่น)
- CTA (1 ประโยค กระตุ้นให้จอง)

ตอบเป็น JSON: {"hook": "...", "body": "...", "cta": "..."}`;

function VariableTag({ v, onClick }: { v: string; onClick: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { onClick(); navigator.clipboard.writeText(`{${v}}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
        background: copied ? "rgba(0,255,212,.12)" : "rgba(77,127,255,.08)",
        border: `1px solid ${copied ? "rgba(0,255,212,.3)" : "rgba(77,127,255,.2)"}`,
        color: copied ? "var(--teal)" : "var(--blue)",
      }}>
      {`{${v}}`} {copied && <Check size={9} />}
    </button>
  );
}

export default function PromptsPage() {
  const [prompts, setPrompts]   = useState<PromptTemplate[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving]     = useState<string | null>(null);
  const [editId, setEditId]     = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PromptTemplate>>({});
  const [newForm, setNewForm]   = useState({ name: "", description: "", template_text: DEFAULT_TEMPLATE, is_active: true });

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/prompts/"); setPrompts(r.data); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newForm.name.trim() || !newForm.template_text.trim()) return;
    setSaving("new");
    try {
      await api.post("/prompts/", newForm);
      setNewForm({ name: "", description: "", template_text: DEFAULT_TEMPLATE, is_active: true });
      setCreating(false); await load();
    } finally { setSaving(null); }
  };

  const handleSave = async (id: string) => {
    setSaving(id);
    try { await api.patch(`/prompts/${id}`, editForm); setEditId(null); await load(); }
    finally { setSaving(null); }
  };

  const handleToggle = async (p: PromptTemplate) => {
    await api.patch(`/prompts/${p.id}`, { is_active: !p.is_active });
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ลบ Prompt Template นี้?")) return;
    await api.delete(`/prompts/${id}`);
    await load();
  };

  const insertVar = (v: string, current: string, setCurrent: (s: string) => void) => {
    setCurrent(current + `{${v}}`);
  };

  return (
    <div className="page-enter" style={{ padding: "28px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        ระบบ · AI
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, letterSpacing: "-.02em", background: "linear-gradient(90deg,var(--teal),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Prompt Management
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--faint)" }}>จัดการ Prompt ที่ AI ใช้สร้าง Script — ปรับแต่งให้ตรงสไตล์แบรนด์</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCw size={13} /></button>
          <button onClick={() => setCreating(v => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, cursor: "pointer",
            background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none", color: "#06060A", fontSize: 12.5, fontWeight: 800,
          }}><Plus size={14} strokeWidth={3} /> Prompt ใหม่</button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ background: "rgba(77,127,255,.06)", border: "1px solid rgba(77,127,255,.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 12.5, color: "var(--dim)", lineHeight: 1.7 }}>
        💡 ใช้ <code style={{ background: "rgba(77,127,255,.12)", padding: "1px 6px", borderRadius: 4, color: "var(--blue)" }}>{"{variable}"}</code> ใน template เพื่อแทรกข้อมูล เช่น <code style={{ background: "rgba(77,127,255,.12)", padding: "1px 6px", borderRadius: 4, color: "var(--blue)" }}>{"{product_name}"}</code> — AI จะเติมค่าจริงก่อนส่งไป
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ background: "var(--glass)", border: "1px solid rgba(0,255,212,.2)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, color: "var(--teal)" }}>+ Prompt Template ใหม่</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
              placeholder="ชื่อ Prompt เช่น Pool Villa — Script หลัก"
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)", borderRadius: 9, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none" }} />
            <input value={newForm.description || ""} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              placeholder="คำอธิบาย (ไม่บังคับ)"
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)", borderRadius: 9, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none" }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Variables ที่ใช้ได้ — คลิกเพื่อแทรก</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                {VARS.map(v => <VariableTag key={v} v={v} onClick={() => setNewForm(f => ({ ...f, template_text: f.template_text + `{${v}}` }))} />)}
              </div>
              <textarea value={newForm.template_text} onChange={e => setNewForm(f => ({ ...f, template_text: e.target.value }))}
                rows={12} placeholder="เขียน Prompt ที่นี่..."
                style={{ width: "100%", background: "rgba(255,255,255,.03)", border: "1px solid var(--gb)", borderRadius: 9, padding: "12px 14px", color: "var(--text)", fontSize: 12.5, fontFamily: "monospace", resize: "vertical", outline: "none", lineHeight: 1.7 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={handleCreate} disabled={saving === "new"} style={{
              padding: "10px 22px", borderRadius: 10, cursor: "pointer",
              background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none", color: "#06060A", fontSize: 13, fontWeight: 800,
            }}>{saving === "new" ? "กำลังบันทึก..." : "บันทึก"}</button>
            <button onClick={() => setCreating(false)} style={{ padding: "10px 18px", borderRadius: 10, cursor: "pointer", background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--faint)", fontSize: 13 }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Prompt list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--faint)" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px", display: "block" }} />
        </div>
      ) : prompts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, background: "var(--glass)", borderRadius: 14, border: "1px solid var(--gb)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--dim)", marginBottom: 6 }}>ยังไม่มี Prompt Template</div>
          <div style={{ fontSize: 12, color: "var(--faint)" }}>กด "Prompt ใหม่" ด้านบนเพื่อเริ่มสร้าง</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {prompts.map(p => (
            <div key={p.id} style={{ background: "var(--glass)", border: `1px solid ${p.is_active ? "rgba(0,255,212,.15)" : "var(--gb)"}`, borderRadius: 14, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: p.is_active ? "linear-gradient(135deg,var(--teal),var(--blue))" : "var(--glass2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🤖</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{p.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: p.is_active ? "rgba(0,255,212,.12)" : "rgba(136,144,174,.12)", color: p.is_active ? "var(--teal)" : "var(--faint)", border: `1px solid ${p.is_active ? "rgba(0,255,212,.25)" : "var(--gb)"}` }}>
                      {p.is_active ? "✓ Active" : "Inactive"}
                    </span>
                  </div>
                  {p.description && <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{p.description}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => handleToggle(p)} title={p.is_active ? "ปิด" : "เปิด"} style={{ padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: "var(--glass2)", border: "1px solid var(--gb)", color: p.is_active ? "var(--teal)" : "var(--faint)" }}>
                    {p.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  </button>
                  <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} style={{ padding: "6px 10px", borderRadius: 8, cursor: "pointer", background: "var(--glass2)", border: "1px solid var(--gb)", color: "var(--dim)" }}>
                    {expanded === p.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <button onClick={() => handleDelete(p.id)} style={{ padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "var(--err)" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Expanded */}
              {expanded === p.id && (
                <div style={{ padding: "0 18px 18px", borderTop: "1px solid var(--gb)" }}>
                  {editId === p.id ? (
                    <div style={{ paddingTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Variables</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                        {VARS.map(v => <VariableTag key={v} v={v} onClick={() => setEditForm(f => ({ ...f, template_text: (f.template_text || p.template_text) + `{${v}}` }))} />)}
                      </div>
                      <textarea value={editForm.template_text ?? p.template_text} onChange={e => setEditForm(f => ({ ...f, template_text: e.target.value }))}
                        rows={12} style={{ width: "100%", background: "rgba(255,255,255,.03)", border: "1px solid var(--gb)", borderRadius: 9, padding: "12px 14px", color: "var(--text)", fontSize: 12.5, fontFamily: "monospace", resize: "vertical", outline: "none", lineHeight: 1.7 }} />
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button onClick={() => handleSave(p.id)} disabled={saving === p.id} style={{ padding: "9px 20px", borderRadius: 9, cursor: "pointer", background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none", color: "#06060A", fontSize: 13, fontWeight: 800 }}>
                          {saving === p.id ? "บันทึก..." : "บันทึก"}
                        </button>
                        <button onClick={() => setEditId(null)} style={{ padding: "9px 16px", borderRadius: 9, cursor: "pointer", background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--faint)", fontSize: 13 }}>ยกเลิก</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ paddingTop: 14 }}>
                      <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 12, lineHeight: 1.7, color: "var(--dim)", background: "rgba(255,255,255,.03)", border: "1px solid var(--gb)", borderRadius: 9, padding: "12px 14px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {p.template_text}
                      </pre>
                      <button onClick={() => { setEditId(p.id); setEditForm({ template_text: p.template_text }); }} style={{ marginTop: 12, padding: "8px 18px", borderRadius: 9, cursor: "pointer", background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.2)", color: "var(--teal)", fontSize: 12.5, fontWeight: 700 }}>แก้ไข</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
