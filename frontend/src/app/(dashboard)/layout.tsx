import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
      {/* Ambient background */}
      <div className="bg-canvas">
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="orb orb3" />
      </div>
      <Sidebar />
      <main style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
        {children}
      </main>
    </div>
  );
}
