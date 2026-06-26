"use client";

import { BarChart3, TrendingUp, Eye, Heart, MessageCircle, Share2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";

const mockData = [
  { day: "จ.", views: 1200, likes: 340, ctr: 3.2 },
  { day: "อ.", views: 980,  likes: 210, ctr: 2.8 },
  { day: "พ.", views: 1850, likes: 620, ctr: 4.1 },
  { day: "พฤ.", views: 1420, likes: 480, ctr: 3.7 },
  { day: "ศ.", views: 2100, likes: 730, ctr: 4.8 },
  { day: "ส.", views: 2800, likes: 950, ctr: 5.2 },
  { day: "อา.", views: 3200, likes: 1100, ctr: 5.9 },
];

const METRICS = [
  { label: "Views ทั้งหมด", value: "13,550", icon: Eye,           change: "+18.4%", color: "var(--teal)",   bg: "rgba(0,255,212,.1)"   },
  { label: "Likes",        value: "4,430",  icon: Heart,         change: "+12.1%", color: "var(--pink)",   bg: "rgba(255,111,183,.1)"  },
  { label: "Comments",     value: "892",    icon: MessageCircle, change: "+5.3%",  color: "var(--purple)", bg: "rgba(155,111,255,.1)"  },
  { label: "Shares",       value: "1,204",  icon: Share2,        change: "+22.7%", color: "var(--blue)",   bg: "rgba(77,127,255,.1)"   },
];

const TIPS = [
  { label: "Hook ที่ดีที่สุด",  tip: "ประโยคคำถามมี CTR สูงกว่า 23%", c: "var(--teal)" },
  { label: "Caption ที่ดี",    tip: "Caption สั้น 5-10 คำ Engagement สูงสุด", c: "var(--blue)" },
  { label: "Voice ที่นิยม",    tip: "เสียงผู้หญิงอบอุ่น Watch Time สูงสุด", c: "var(--purple)" },
];

export default function AnalyticsPage() {
  return (
    <div className="page-enter" style={{ padding: "32px 40px", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--faint)" }}>
          11 · วิเคราะห์
        </p>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>Analytics</h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--dim)" }}>
          วิเคราะห์ประสิทธิภาพคอนเทนต์
        </p>
      </div>

      {/* Coming soon notice */}
      <div style={{ marginBottom: 20, padding: "14px 18px", background: "rgba(255,176,46,.07)", border: "1px solid rgba(255,176,46,.22)", borderRadius: 14, display: "flex", gap: 12, alignItems: "center" }}>
        <BarChart3 size={16} color="var(--warn)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>ข้อมูลตัวอย่าง (Demo)</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--dim)", lineHeight: 1.55 }}>
            Analytics กำลังพัฒนา — ข้อมูลที่แสดงเป็นตัวอย่างสาธิตเท่านั้น ยังไม่ได้เชื่อมต่อกับ TikTok / Instagram API
          </p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: "rgba(255,176,46,.15)", color: "var(--warn)", flexShrink: 0 }}>Coming Soon</span>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {METRICS.map(({ label, value, icon: Icon, change, color, bg }) => (
          <div key={label} className="kpi">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--faint)" }}>
                {label}
              </span>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={15} color={color} strokeWidth={2} />
              </div>
            </div>
            <p style={{ margin: "8px 0 4px", fontSize: 28, fontWeight: 800, letterSpacing: "-.025em", color: "var(--text)" }}>{value}</p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--ok)", fontWeight: 700 }}>{change} vs สัปดาห์ก่อน</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Bar chart */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>Views รายวัน</h2>
            <span className="tag tag-warn">ตัวอย่าง</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mockData} barSize={28}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,.04)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8890AE", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8890AE", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#0e0f18", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "#EEF0F8", fontWeight: 700 }}
                itemStyle={{ color: "#00FFD4" }}
              />
              <Bar dataKey="views" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00FFD4" />
                  <stop offset="100%" stopColor="#4D7FFF" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line chart */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>CTR รายวัน (%)</h2>
            <span className="tag tag-ok">avg 4.1%</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={mockData}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,.04)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8890AE", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8890AE", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 7]} />
              <Tooltip
                contentStyle={{ background: "#0e0f18", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "#EEF0F8", fontWeight: 700 }}
                itemStyle={{ color: "#9B6FFF" }}
                formatter={(v: number) => [`${v}%`, "CTR"]}
              />
              <Line
                type="monotone" dataKey="ctr" stroke="#9B6FFF" strokeWidth={2.5}
                dot={{ fill: "#9B6FFF", r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#9B6FFF" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Insights */}
      <div className="feedback-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(0,255,212,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <TrendingUp size={15} color="var(--teal)" />
          </div>
          <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>AI Insights</h2>
          <span className="tag tag-warn" style={{ marginLeft: "auto" }}>ตัวอย่าง</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {TIPS.map(({ label, tip, c }) => (
            <div key={label} style={{
              padding: "14px 16px",
              background: `${c}08`, border: `1px solid ${c}22`, borderRadius: 14,
            }}>
              <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: c }}>{label}</p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--dim)", lineHeight: 1.55 }}>{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
