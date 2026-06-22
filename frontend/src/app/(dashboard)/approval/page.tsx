"use client";
export default function ApprovalPage() {
  return (
    <div style={{ padding: "28px 40px" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>10 · กลุ่ม 4</p>
      <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>อนุมัติ</h1>
      <p style={{ color: "var(--faint)", fontSize: 13 }}>อนุมัติหรือปฏิเสธคอนเทนต์ก่อนโพสต์</p>
      <div style={{ marginTop: 32, padding: 24, background: "var(--glass)", border: "1px solid var(--gb)", borderRadius: 14, fontSize: 13, color: "var(--dim)" }}>
        🔧 หน้านี้อยู่ระหว่างพัฒนา
      </div>
    </div>
  );
}
