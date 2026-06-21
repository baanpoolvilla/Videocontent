"use client";

import { Calendar, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const mockSchedule = [
  { id: "1", product: "ครีมบำรุงผิว X", platform: "TikTok", time: "10:00", date: "22 มิ.ย.", status: "scheduled" },
  { id: "2", product: "เซรั่มวิตามินซี", platform: "Instagram", time: "14:00", date: "22 มิ.ย.", status: "published" },
  { id: "3", product: "มาสก์หน้า Premium", platform: "YouTube Shorts", time: "18:00", date: "23 มิ.ย.", status: "scheduled" },
  { id: "4", product: "ลิปสติก Matte", platform: "TikTok", time: "20:00", date: "23 มิ.ย.", status: "failed" },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  scheduled: { label: "ตั้งเวลาแล้ว", color: "text-blue-600 bg-blue-50 border-blue-200", icon: Clock },
  published: { label: "โพสต์แล้ว", color: "text-green-600 bg-green-50 border-green-200", icon: CheckCircle2 },
  failed: { label: "ล้มเหลว", color: "text-red-600 bg-red-50 border-red-200", icon: AlertCircle },
};

export default function SchedulePage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">ตั้งเวลาโพสต์</h1>
        <p className="text-gray-500 mt-1">จัดการตารางโพสต์คอนเทนต์อัตโนมัติ</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-violet-600" />
          <h2 className="font-semibold text-gray-900">ตารางโพสต์</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {mockSchedule.map((item) => {
            const s = STATUS_MAP[item.status];
            const Icon = s.icon;
            return (
              <div key={item.id} className="px-6 py-4 flex items-center gap-4">
                <div className="text-center min-w-[60px]">
                  <p className="text-xs text-gray-400">{item.date}</p>
                  <p className="text-sm font-bold text-gray-900">{item.time}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.product}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.platform}</p>
                </div>
                <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${s.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
