"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Sparkles, Save, Plus, Trash2, Star, StarOff, ChevronDown, ChevronUp } from "lucide-react";

interface BrandProfile {
  id: string;
  name: string;
  description: string | null;
  tone_of_voice: string | null;
  target_audience: string | null;
  cta_style: string | null;
  forbidden_words: string[] | null;
  is_default: boolean;
  created_at: string;
}

const EMPTY: Omit<BrandProfile, "id" | "is_default" | "created_at"> = {
  name: "",
  description: "",
  tone_of_voice: "",
  target_audience: "",
  cta_style: "",
  forbidden_words: [],
};

const PRESETS = [
  {
    label: "Pool Villa Pattaya (แนะนำ)",
    data: {
      name: "Banana Pool Villa Pattaya",
      description: "Pool villa สระส่วนตัว พัทยา เหมาะคู่รัก ครอบครัว กลุ่มเพื่อน ใกล้กรุงเทพ 2 ชม.",
      tone_of_voice: "สบายๆ เป็นกันเอง อารมณ์ดี ใช้ภาษาไทยธรรมชาติ เน้นความรู้สึก ไม่เป็นทางการ เหมือนเพื่อนแนะนำ ใส่ความ FOMO เล็กน้อย",
      target_audience: "คู่รัก อายุ 25-40 ปี / ครอบครัวเล็ก / กลุ่มเพื่อน ต้องการพักผ่อน ชอบสระส่วนตัว งบ 5,000-15,000 ต่อคืน",
      cta_style: "กระตุ้นจอง เช่น 'จองเลยก่อนเต็ม' / 'LINE มาได้เลย' / 'ดูห้องว่างวันนี้'",
      forbidden_words: ["ราคาถูก", "งบน้อย", "โรงแรม 3 ดาว", "ธรรมดา"],
    },
  },
  {
    label: "Luxury Brand",
    data: {
      name: "Luxury Brand",
      description: "แบรนด์ระดับพรีเมียม เน้นคุณค่าและความพิเศษ",
      tone_of_voice: "หรู มีระดับ ซีเนมาติก บรรยายละเอียด ใช้คำศัพท์ระดับสูง น้ำเสียงมั่นใจ",
      target_audience: "ผู้มีรายได้สูง อายุ 30-55 ปี ชอบความพิเศษและประสบการณ์เฉพาะ",
      cta_style: "สัมผัสความพิเศษ / นัดชมได้เลย / ติดต่อทีมงาน",
      forbidden_words: ["ถูก", "ลด", "ราคาพิเศษ", "โปรโมชั่น"],
    },
  },
];

export default function BrandProfilePage() {
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [wordInput, setWordInput] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<BrandProfile>>({});
  const [editWordInput, setEditWordInput] = useState("");

  const load = async () => {
    try {
      const r = await api.get("/brand-profiles/");
      setProfiles(r.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving("new");
    try {
      await api.post("/brand-profiles/", form);
      setForm({ ...EMPTY }); setWordInput(""); setCreating(false);
      await load();
    } finally { setSaving(null); }
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(id);
    try {
      await api.patch(`/brand-profiles/${id}`, editForm);
      setEditId(null); await load();
    } finally { setSaving(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ลบ Brand Profile นี้?")) return;
    await api.delete(`/brand-profiles/${id}`);
    await load();
  };

  const handleSetDefault = async (id: string) => {
    await api.post(`/brand-profiles/${id}/set-default`);
    await load();
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setForm({ ...EMPTY, ...preset.data, forbidden_words: preset.data.forbidden_words });
    setCreating(true);
  };

  const addWord = (words: string[], setWords: (w: string[]) => void, input: string, setInput: (s: string) => void) => {
    const w = input.trim();
    if (!w || words.includes(w)) return;
    setWords([...words, w]);
    setInput("");
  };

  const defaultProfile = profiles.find(p => p.is_default);

  return (
    <div className="page-enter" style={{ padding: "28px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
        ระบบ · Brand
      </p>
      <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 900, letterSpacing: "-.02em", background: "linear-gradient(90deg,var(--teal),var(--blue))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        Brand Profile
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--faint)" }}>
        กำหนด Tone of Voice, กลุ่มเป้าหมาย และ CTA — AI จะนำไปใช้ทุกครั้งที่สร้าง Script อัตโนมัติ
      </p>

      {/* Active brand banner */}
      {defaultProfile && (
        <div style={{
          background: "linear-gradient(135deg, rgba(0,255,212,.08), rgba(77,127,255,.06))",
          border: "1px solid rgba(0,255,212,.25)", borderRadius: 14, padding: "14px 18px",
          marginBottom: 20, display: "flex", alignItems: "center", gap: 12,
        }}>
          <Sparkles size={18} color="var(--teal)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--teal)" }}>Brand ที่ AI ใช้อยู่ตอนนี้</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginTop: 2 }}>{defaultProfile.name}</div>
            {defaultProfile.tone_of_voice && (
              <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2, lineHeight: 1.5 }}>
                Tone: {defaultProfile.tone_of_voice.slice(0, 120)}{defaultProfile.tone_of_voice.length > 120 ? "..." : ""}
              </div>
            )}
          </div>
          <div style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(0,255,212,.12)", border: "1px solid rgba(0,255,212,.25)", fontSize: 10.5, color: "var(--teal)", fontWeight: 800 }}>
            ✓ Default
          </div>
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600 }}>
          {profiles.length} profiles
        </span>
        <button onClick={() => setCreating(v => !v)} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "9px 16px", borderRadius: 10, cursor: "pointer",
          background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none",
          color: "#06060A", fontSize: 12.5, fontWeight: 800,
        }}>
          <Plus size={14} strokeWidth={3} /> สร้าง Brand Profile
        </button>
      </div>

      {/* Preset quick-start */}
      {creating && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8 }}>เริ่มจาก Preset:</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)} style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.2)", color: "var(--teal)",
              }}>
                ✨ {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div style={{ background: "var(--glass)", border: "1px solid rgba(0,255,212,.2)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, color: "var(--teal)" }}>+ Brand Profile ใหม่</h3>
          <ProfileForm
            data={form}
            onChange={f => setForm(f as typeof form)}
            wordInput={wordInput}
            setWordInput={setWordInput}
            onAddWord={() => addWord(form.forbidden_words || [], w => setForm(f => ({ ...f, forbidden_words: w })), wordInput, setWordInput)}
            onRemoveWord={w => setForm(f => ({ ...f, forbidden_words: (f.forbidden_words || []).filter(x => x !== w) }))}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={handleCreate} disabled={saving === "new" || !form.name.trim()} style={{
              padding: "10px 24px", borderRadius: 10, cursor: "pointer",
              background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none",
              color: "#06060A", fontSize: 13, fontWeight: 800,
              opacity: saving === "new" ? .6 : 1,
            }}>
              <Save size={13} style={{ marginRight: 6 }} />{saving === "new" ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button onClick={() => { setCreating(false); setForm({ ...EMPTY }); }} style={{
              padding: "10px 20px", borderRadius: 10, cursor: "pointer",
              background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--faint)", fontSize: 13,
            }}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Profile list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--faint)" }}>กำลังโหลด...</div>
      ) : profiles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--faint)", background: "var(--glass)", borderRadius: 14, border: "1px solid var(--gb)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏷️</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>ยังไม่มี Brand Profile</div>
          <div style={{ fontSize: 12 }}>กด "สร้าง Brand Profile" ด้านบน หรือเลือก Preset Pool Villa ที่เตรียมไว้</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {profiles.map(profile => (
            <div key={profile.id} style={{
              background: "var(--glass)", borderRadius: 14,
              border: `1px solid ${profile.is_default ? "rgba(0,255,212,.3)" : "var(--gb)"}`,
              overflow: "hidden",
            }}>
              {/* Card header */}
              <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: profile.is_default ? "linear-gradient(135deg,var(--teal),var(--blue))" : "var(--glass2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16,
                }}>🏷️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{profile.name}</span>
                    {profile.is_default && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--teal)", background: "rgba(0,255,212,.12)", border: "1px solid rgba(0,255,212,.25)", padding: "2px 8px", borderRadius: 5 }}>
                        ✓ DEFAULT
                      </span>
                    )}
                  </div>
                  {profile.description && (
                    <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{profile.description}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {!profile.is_default && (
                    <button onClick={() => handleSetDefault(profile.id)} title="ตั้งเป็น Default" style={{
                      padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                      background: "rgba(255,176,46,.08)", border: "1px solid rgba(255,176,46,.2)",
                      color: "var(--warn)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <Star size={12} /> ตั้งเป็น Default
                    </button>
                  )}
                  <button onClick={() => { setExpanded(expanded === profile.id ? null : profile.id); setEditId(null); }} style={{
                    padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                    background: "var(--glass2)", border: "1px solid var(--gb)", color: "var(--dim)",
                  }}>
                    {expanded === profile.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <button onClick={() => handleDelete(profile.id)} style={{
                    padding: "6px 8px", borderRadius: 8, cursor: "pointer",
                    background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)",
                    color: "var(--err)",
                  }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Expanded edit */}
              {expanded === profile.id && (
                <div style={{ padding: "0 18px 18px", borderTop: "1px solid var(--gb)" }}>
                  <div style={{ paddingTop: 16 }}>
                    {editId === profile.id ? (
                      <>
                        <ProfileForm
                          data={{ ...profile, forbidden_words: profile.forbidden_words || [] }}
                          onChange={f => setEditForm(f)}
                          wordInput={editWordInput}
                          setWordInput={setEditWordInput}
                          onAddWord={() => {
                            const w = editWordInput.trim();
                            if (!w) return;
                            setEditForm(f => ({ ...f, forbidden_words: [...(f.forbidden_words || profile.forbidden_words || []), w] }));
                            setEditWordInput("");
                          }}
                          onRemoveWord={w => setEditForm(f => ({ ...f, forbidden_words: (f.forbidden_words || profile.forbidden_words || []).filter(x => x !== w) }))}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                          <button onClick={() => handleSaveEdit(profile.id)} disabled={saving === profile.id} style={{
                            padding: "10px 22px", borderRadius: 10, cursor: "pointer",
                            background: "linear-gradient(90deg,var(--teal),var(--blue))", border: "none",
                            color: "#06060A", fontSize: 13, fontWeight: 800,
                          }}>
                            {saving === profile.id ? "กำลังบันทึก..." : "บันทึก"}
                          </button>
                          <button onClick={() => setEditId(null)} style={{
                            padding: "10px 18px", borderRadius: 10, cursor: "pointer",
                            background: "var(--glass)", border: "1px solid var(--gb)", color: "var(--faint)", fontSize: 13,
                          }}>ยกเลิก</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <ProfileView profile={profile} />
                        <button onClick={() => { setEditId(profile.id); setEditForm({ ...profile }); setEditWordInput(""); }} style={{
                          marginTop: 14, padding: "8px 18px", borderRadius: 9, cursor: "pointer",
                          background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.2)",
                          color: "var(--teal)", fontSize: 12.5, fontWeight: 700,
                        }}>แก้ไข</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileView({ profile }: { profile: BrandProfile }) {
  const row = (label: string, val: string | null | undefined) =>
    val ? (
      <div key={label} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "8px 12px", border: "1px solid var(--gb)" }}>{val}</div>
      </div>
    ) : null;
  return (
    <div>
      {row("Tone of Voice", profile.tone_of_voice)}
      {row("กลุ่มเป้าหมาย", profile.target_audience)}
      {row("CTA Style", profile.cta_style)}
      {profile.forbidden_words && profile.forbidden_words.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)", marginBottom: 6 }}>คำที่ห้ามใช้</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {profile.forbidden_words.map(w => (
              <span key={w} style={{ padding: "3px 10px", borderRadius: 6, background: "rgba(255,77,106,.1)", border: "1px solid rgba(255,77,106,.2)", fontSize: 11.5, color: "var(--err)", fontWeight: 700 }}>
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileForm({ data, onChange, wordInput, setWordInput, onAddWord, onRemoveWord }: {
  data: Partial<BrandProfile>;
  onChange: (d: Partial<BrandProfile>) => void;
  wordInput: string;
  setWordInput: (s: string) => void;
  onAddWord: () => void;
  onRemoveWord: (w: string) => void;
}) {
  const field = (key: keyof BrandProfile, label: string, placeholder: string, rows = 2) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)", marginBottom: 5 }}>{label}</label>
      <textarea
        value={(data[key] as string) || ""}
        onChange={e => onChange({ ...data, [key]: e.target.value })}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)",
          borderRadius: 9, padding: "10px 12px", color: "var(--text)", fontSize: 13,
          fontFamily: "inherit", resize: "vertical", outline: "none", lineHeight: 1.6,
        }}
      />
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
      <div style={{ gridColumn: "1 / -1" }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)", marginBottom: 5 }}>ชื่อ Brand Profile *</label>
          <input
            value={data.name || ""}
            onChange={e => onChange({ ...data, name: e.target.value })}
            placeholder="เช่น Banana Pool Villa Pattaya"
            style={{
              width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)",
              borderRadius: 9, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none",
            }}
          />
        </div>
      </div>
      <div>{field("tone_of_voice", "Tone of Voice", "เช่น: สบายๆ เป็นกันเอง เน้นความรู้สึก ไม่เป็นทางการ", 3)}</div>
      <div>{field("target_audience", "กลุ่มเป้าหมาย", "เช่น: คู่รัก อายุ 25-40 ปี ชอบสระส่วนตัว", 3)}</div>
      <div style={{ gridColumn: "1 / -1" }}>
        {field("cta_style", "CTA Style", "เช่น: จองเลยก่อนเต็ม / LINE มาได้เลย", 1)}
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)", marginBottom: 5 }}>คำที่ห้ามใช้</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={wordInput}
            onChange={e => setWordInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onAddWord()}
            placeholder="พิมคำแล้วกด Enter หรือ +"
            style={{
              flex: 1, background: "rgba(255,255,255,.04)", border: "1px solid var(--gb)",
              borderRadius: 9, padding: "8px 12px", color: "var(--text)", fontSize: 13, outline: "none",
            }}
          />
          <button onClick={onAddWord} style={{
            padding: "8px 14px", borderRadius: 9, cursor: "pointer",
            background: "rgba(0,255,212,.08)", border: "1px solid rgba(0,255,212,.2)", color: "var(--teal)", fontSize: 13,
          }}>+</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(data.forbidden_words || []).map(w => (
            <span key={w} onClick={() => onRemoveWord(w)} style={{
              padding: "3px 10px", borderRadius: 6, cursor: "pointer",
              background: "rgba(255,77,106,.1)", border: "1px solid rgba(255,77,106,.2)",
              fontSize: 11.5, color: "var(--err)", fontWeight: 700,
            }}>
              {w} ×
            </span>
          ))}
        </div>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginTop: 4 }}>
          <div
            onClick={() => onChange({ ...data, is_default: !data.is_default })}
            style={{
              width: 34, height: 19, borderRadius: 10, position: "relative", cursor: "pointer",
              background: data.is_default ? "linear-gradient(90deg,var(--teal),var(--blue))" : "var(--glass2)",
              transition: "background .2s",
            }}
          >
            <div style={{
              position: "absolute", top: 2, width: 15, height: 15, borderRadius: "50%",
              left: data.is_default ? "auto" : 2, right: data.is_default ? 2 : "auto",
              background: data.is_default ? "#06060A" : "var(--faint)", transition: "all .2s",
            }} />
          </div>
          <span style={{ fontSize: 12.5, color: "var(--dim)", fontWeight: 600 }}>
            ตั้งเป็น Brand Profile หลัก (AI จะใช้ทุกครั้ง)
          </span>
        </label>
      </div>
    </div>
  );
}
