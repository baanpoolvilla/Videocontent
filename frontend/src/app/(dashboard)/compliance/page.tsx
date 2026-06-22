"use client";

import { useState } from "react";
import { ShieldCheck, CheckCircle2, Circle, AlertTriangle, Info } from "lucide-react";

const RULES = [
  {
    group: "เนื้อหา",
    color: "var(--teal)",
    items: [
      { id: "no_mislead",  label: "ไม่มีข้อมูลเท็จหรือทำให้เข้าใจผิด" },
      { id: "no_promise",  label: "ไม่อ้างผลลัพธ์เกินจริง เช่น 'รักษาได้ 100%'" },
      { id: "has_cta",     label: "มี Call-to-Action ชัดเจน" },
      { id: "thai_lang",   label: "ภาษาไทยถูกต้อง ไม่มีคำหยาบ" },
    ],
  },
  {
    group: "ภาพและเสียง",
    color: "var(--blue)",
    items: [
      { id: "vid_quality", label: "วิดีโอความละเอียดไม่ต่ำกว่า 720p" },
      { id: "audio_clear", label: "เสียงชัดเจน ไม่มีเสียงรบกวน" },
      { id: "logo_visible",label: "ไม่บังโลโก้หรือข้อมูลสำคัญ" },
      { id: "aspect_ratio",label: "อัตราส่วน 9:16 (สำหรับ TikTok/Reels)" },
    ],
  },
  {
    group: "กฎหมายและแพลตฟอร์ม",
    color: "var(--warn)",
    items: [
      { id: "no_copy",     label: "ไม่มีเนื้อหาละเมิดลิขสิทธิ์" },
      { id: "age_ok",      label: "เนื้อหาเหมาะสมสำหรับทุกวัย" },
      { id: "no_drug",     label: "ไม่โฆษณายาหรือผลิตภัณฑ์สุขภาพแบบผิดกฎหมาย" },
      { id: "disclosure",  label: "มีการเปิดเผยว่าเป็นโฆษณา (ถ้าจำเป็น)" },
      { id: "no_politic",  label: "ไม่มีเนื้อหาการเมืองหรือศาสนา" },
    ],
  },
  {
    group: "คุณภาพ TikTok",
    color: "var(--purple)",
    items: [
      { id: "hook_3s",     label: "3 วินาทีแรกดึงดูดความสนใจ" },
      { id: "vid_len",     label: "ความยาว 15–60 วินาที (optimal)" },
      { id: "caption_ok",  label: "Caption และ Hashtag ตรงเนื้อหา" },
      { id: "trending",    label: "ใช้ Sound หรือ Trend ที่กำลังนิยม" },
    ],
  },
];

export default function CompliancePage() {
  const allIds = RULES.flatMap(g => g.items.map(i => i.id));
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const checkAll = (ids: string[]) =>
    setChecked(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });

  const score     = checked.size;
  const total     = allIds.length;
  const pct       = Math.round((score / total) * 100);
  const readyColor = pct >= 80 ? "var(--ok)" : pct >= 50 ? "var(--warn)" : "var(--err)";

  return (
    <div className="page-enter" style={{ padding: "32px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>08 · มาตรฐาน</p>
      <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800 }}>ตรวจสอบมาตรฐาน</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--dim)" }}>ตรวจสอบคอนเทนต์ให้ผ่านมาตรฐานก่อนโพสต์</p>

      {/* Score */}
      <div style={{ background: "var(--glass)", border: `1px solid ${readyColor}33`, borderRadius: 16, padding: "20px 24px", marginBottom: 24, display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
          background: `conic-gradient(${readyColor} ${pct * 3.6}deg, rgba(255,255,255,.07) 0deg)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 20px ${readyColor}44`,
        }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: readyColor }}>{pct}%</span>
          </div>
        </div>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: readyColor }}>
            {pct >= 80 ? "พร้อมโพสต์!" : pct >= 50 ? "ใกล้พร้อม" : "ต้องปรับปรุง"}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--dim)" }}>
            ผ่าน {score} / {total} รายการ
          </p>
        </div>
        {pct >= 80 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "rgba(34,212,153,.1)", border: "1px solid rgba(34,212,153,.25)", borderRadius: 12 }}>
            <ShieldCheck size={18} color="var(--ok)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ok)" }}>Ready to Post</span>
          </div>
        )}
      </div>

      {/* Checklist */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {RULES.map(group => {
          const groupChecked = group.items.filter(i => checked.has(i.id)).length;
          return (
            <div key={group.group} style={{ background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--gb)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: group.color, boxShadow: `0 0 8px ${group.color}88` }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{group.group}</span>
                  <span style={{ fontSize: 11, color: groupChecked === group.items.length ? "var(--ok)" : "var(--faint)", fontWeight: 600 }}>
                    {groupChecked}/{group.items.length}
                  </span>
                </div>
                <button onClick={() => checkAll(group.items.map(i => i.id))} style={{
                  padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: "1px solid var(--gb)", background: "var(--glass)", color: "var(--faint)",
                }}>เลือกทั้งหมด</button>
              </div>
              <div style={{ padding: "8px 18px" }}>
                {group.items.map(item => {
                  const done = checked.has(item.id);
                  return (
                    <div key={item.id} onClick={() => toggle(item.id)} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "11px 0",
                      borderBottom: "1px solid rgba(255,255,255,.03)", cursor: "pointer",
                      transition: "opacity .1s",
                    }}>
                      {done
                        ? <CheckCircle2 size={18} color="var(--ok)" strokeWidth={2} style={{ flexShrink: 0 }} />
                        : <Circle size={18} color="var(--gb)" strokeWidth={1.5} style={{ flexShrink: 0 }} />}
                      <span style={{ fontSize: 13, color: done ? "var(--text)" : "var(--dim)", fontWeight: done ? 600 : 400, textDecoration: done ? "none" : "none", transition: "color .15s" }}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Note */}
      <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(77,127,255,.06)", border: "1px solid rgba(77,127,255,.18)", borderRadius: 12, display: "flex", gap: 10 }}>
        <Info size={15} color="var(--blue)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12, color: "var(--dim)", lineHeight: 1.65 }}>
          รายการนี้ใช้สำหรับการตรวจสอบด้วยตนเอง ไม่ได้บันทึกอัตโนมัติ — ตรวจสอบก่อนทุกครั้งที่จะโพสต์
        </p>
      </div>

      {pct >= 80 && (
        <div style={{ marginTop: 16, padding: "14px 16px", background: "rgba(34,212,153,.06)", border: "1px solid rgba(34,212,153,.2)", borderRadius: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <AlertTriangle size={15} color="var(--ok)" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 12, color: "var(--ok)", lineHeight: 1.65, fontWeight: 600 }}>
            คอนเทนต์ของคุณผ่านมาตรฐาน {pct}% — พร้อมไปที่หน้า อนุมัติ เพื่อดำเนินการต่อ
          </p>
        </div>
      )}
    </div>
  );
}
