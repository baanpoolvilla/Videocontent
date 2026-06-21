"use client";

import { BarChart3, TrendingUp, Eye, Heart, MessageCircle, Share2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const mockData = [
  { day: "จ.", views: 1200, likes: 340, ctr: 3.2 },
  { day: "อ.", views: 980, likes: 210, ctr: 2.8 },
  { day: "พ.", views: 1850, likes: 620, ctr: 4.1 },
  { day: "พฤ.", views: 1420, likes: 480, ctr: 3.7 },
  { day: "ศ.", views: 2100, likes: 730, ctr: 4.8 },
  { day: "ส.", views: 2800, likes: 950, ctr: 5.2 },
  { day: "อา.", views: 3200, likes: 1100, ctr: 5.9 },
];

function MetricCard({ label, value, icon: Icon, change }: {
  label: string; value: string; icon: React.ElementType; change: string;
}) {
  const positive = change.startsWith("+");
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{label}</p>
        <Icon className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className={`text-xs mt-1 ${positive ? "text-green-600" : "text-red-500"}`}>{change} vs สัปดาห์ก่อน</p>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 mt-1">วิเคราะห์ประสิทธิภาพคอนเทนต์</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Views ทั้งหมด" value="13,550" icon={Eye} change="+18.4%" />
        <MetricCard label="Likes" value="4,430" icon={Heart} change="+12.1%" />
        <MetricCard label="Comments" value="892" icon={MessageCircle} change="+5.3%" />
        <MetricCard label="Shares" value="1,204" icon={Share2} change="+22.7%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Views รายวัน</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mockData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="views" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">CTR รายวัน (%)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={mockData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 7]} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Line type="monotone" dataKey="ctr" stroke="#7c3aed" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-violet-600" />
          <h2 className="font-semibold text-gray-900">AI Feedback Engine</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Hook ที่ดีที่สุด", tip: "ประโยคคำถามมี CTR สูงกว่า 23%" },
            { label: "Caption ที่ดี", tip: "Caption สั้น 5-10 คำ ได้ Engagement สูงสุด" },
            { label: "Voice ที่นิยม", tip: "เสียงผู้หญิง อบอุ่น มี Watch Time สูงสุด" },
          ].map(({ label, tip }) => (
            <div key={label} className="bg-violet-50 border border-violet-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1">{label}</p>
              <p className="text-sm text-gray-700">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
