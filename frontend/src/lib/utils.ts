import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency }).format(value);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export const JOB_STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ",
  processing: "กำลังประมวลผล",
  completed: "เสร็จสิ้น",
  failed: "ล้มเหลว",
  dead_letter: "Dead Letter",
  retrying: "กำลัง Retry",
};

export const REVIEW_STATUS_LABEL: Record<string, string> = {
  draft: "ฉบับร่าง",
  review_needed: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
};

export const PLATFORM_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube_shorts: "YouTube Shorts",
  facebook: "Facebook",
  twitter: "Twitter/X",
};
