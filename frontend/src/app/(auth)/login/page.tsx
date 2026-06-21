"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
import { Loader2, Zap } from "lucide-react";

const schema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router   = useRouter();
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError("");
    try {
      const formData = new URLSearchParams();
      formData.append("username", data.email);
      formData.append("password", data.password);

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/auth/login`,
        formData,
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      localStorage.setItem("access_token", res.data.access_token);
      localStorage.setItem("refresh_token", res.data.refresh_token);
      router.push("/dashboard");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", position: "relative", overflow: "hidden",
    }}>
      {/* Ambient orbs */}
      <div className="bg-canvas">
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="orb orb3" />
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 440, padding: "20px" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div className="brand-mark" style={{ margin: "0 auto 14px", width: 52, height: 52, borderRadius: 16, fontSize: 22 }}>
            <Zap size={22} strokeWidth={3} />
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>
            AI Content Studio
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--dim)" }}>เข้าสู่ระบบเพื่อสร้างคอนเทนต์ AI</p>
        </div>

        {/* Card */}
        <div className="modal" style={{ maxWidth: "none" }}>
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 7 }}>อีเมล</label>
              <input
                {...register("email")}
                type="email"
                className="cs-input"
                placeholder="you@example.com"
              />
              {errors.email && <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--err)" }}>{errors.email.message}</p>}
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", display: "block", marginBottom: 7 }}>รหัสผ่าน</label>
              <input
                {...register("password")}
                type="password"
                className="cs-input"
                placeholder="••••••••"
              />
              {errors.password && <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--err)" }}>{errors.password.message}</p>}
            </div>

            {error && (
              <div style={{ padding: "12px 14px", background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.2)", borderRadius: 10, fontSize: 13, color: "var(--err)" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="gen-btn"
              style={{ width: "100%", marginTop: 6, opacity: loading ? .7 : 1 }}
            >
              {loading
                ? <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    กำลังเข้าสู่ระบบ…
                  </span>
                : "เข้าสู่ระบบ"
              }
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "var(--faint)" }}>
          AI Content Pipeline · v2.0
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
