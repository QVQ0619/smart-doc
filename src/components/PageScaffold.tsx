import type { ReactNode } from "react";

interface PageScaffoldProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export default function PageScaffold({
  title,
  subtitle,
  children,
}: PageScaffoldProps) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{title}</h1>
        {subtitle && (
          <p style={{ margin: "4px 0 0", color: "#86909c", fontSize: 13 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e6eb",
          borderRadius: 12,
          padding: 24,
        }}
      >
        {children}
      </div>
    </div>
  );
}
