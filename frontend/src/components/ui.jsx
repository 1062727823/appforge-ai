export function StatusPill({ children, className = "idle" }) {
  return <span className={`status-pill ${className}`}>{children}</span>;
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

export function KvGrid({ items }) {
  return (
    <div className="kv-grid">
      {items.map(([label, value]) => (
        <div className="kv-item" key={label}>
          <span className="kv-label">{label}</span>
          <code className="kv-value">{value || "-"}</code>
        </div>
      ))}
    </div>
  );
}
