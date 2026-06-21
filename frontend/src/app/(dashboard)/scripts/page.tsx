"use client";

import { FileText, Pencil, CheckCircle2, Clock } from "lucide-react";

const mockScripts = [
  {
    id: "1",
    product: "ครีมบำรุงผิว X",
    hook: "หน้าใสใน 7 วัน จริงหรือเปล่า?",
    body: "ครีมบำรุงผิว X สูตรพิเศษจากธรรมชาติ...",
    cta: "สั่งเลยวันนี้ ลด 30%!",
    is_approved: true,
    version: 2,
  },
  {
    id: "2",
    product: "เซรั่มวิตามินซี",
    hook: "ผิวหมองคล้ำ? เราช่วยได้!",
    body: "เซรั่มวิตามินซี เข้มข้น 20% ...",
    cta: "ทดลองฟรี 7 วัน!",
    is_approved: false,
    version: 1,
  },
];

export default function ScriptsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Script Editor</h1>
        <p className="text-gray-500 mt-1">ตรวจสอบและแก้ไข Script ที่ AI สร้าง</p>
      </div>

      <div className="space-y-4">
        {mockScripts.map((s) => (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{s.product}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Version {s.version}</p>
              </div>
              <div className="flex items-center gap-2">
                {s.is_approved ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    อนุมัติแล้ว
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                    <Clock className="w-3.5 h-3.5" />
                    รอตรวจสอบ
                  </span>
                )}
                <button className="p-1.5 text-gray-400 hover:text-violet-600 transition">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Hook</p>
                <p className="text-sm text-gray-800">{s.hook}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Body</p>
                <p className="text-sm text-gray-800 line-clamp-3">{s.body}</p>
              </div>
              <div className="bg-violet-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1">CTA</p>
                <p className="text-sm text-gray-800">{s.cta}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
