"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Film, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { JOB_STATUS_LABEL, REVIEW_STATUS_LABEL, PLATFORM_LABEL } from "@/lib/utils";

interface Job {
  id: string;
  product_id: string;
  status: string;
  review_status: string;
  platform: string | null;
  error_message: string | null;
  retry_count: number;
  created_by: string | null;
}

const STATUS_ICON: Record<string, React.ElementType> = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-gray-500 bg-gray-100",
  processing: "text-blue-600 bg-blue-50",
  completed: "text-green-600 bg-green-50",
  failed: "text-red-600 bg-red-50",
  dead_letter: "text-red-800 bg-red-100",
  retrying: "text-amber-600 bg-amber-50",
};

export default function RenderQueuePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/jobs/").then((r) => {
      setJobs(r.data);
      setLoading(false);
    });
  }, []);

  const handleApprove = async (id: string) => {
    await api.patch(`/jobs/${id}/approve`);
    setJobs((j) => j.map((job) => (job.id === id ? { ...job, review_status: "approved" } : job)));
  };

  const handleReject = async (id: string) => {
    await api.patch(`/jobs/${id}/reject`);
    setJobs((j) => j.map((job) => (job.id === id ? { ...job, review_status: "rejected" } : job)));
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Render Queue</h1>
        <p className="text-gray-500 mt-1">ติดตามสถานะการสร้างวิดีโอ</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Film className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>ยังไม่มีงานในคิว</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const Icon = STATUS_ICON[job.status] || Clock;
            const colorClass = STATUS_COLOR[job.status] || STATUS_COLOR.pending;
            return (
              <div key={job.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
                <div className={`p-2 rounded-lg ${colorClass}`}>
                  <Icon className={`w-5 h-5 ${job.status === "processing" ? "animate-spin" : ""}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">Job: {job.id.slice(0, 8)}…</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>
                      {JOB_STATUS_LABEL[job.status] || job.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      ตรวจสอบ: {REVIEW_STATUS_LABEL[job.review_status] || job.review_status}
                    </span>
                    {job.platform && (
                      <span className="text-xs text-gray-400">{PLATFORM_LABEL[job.platform] || job.platform}</span>
                    )}
                  </div>
                </div>
                {job.review_status === "review_needed" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(job.id)}
                      className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition"
                    >
                      อนุมัติ
                    </button>
                    <button
                      onClick={() => handleReject(job.id)}
                      className="text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition"
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
