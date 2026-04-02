import { Link } from "react-router-dom";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; to?: string; onClick?: () => void };
}

const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="text-center py-16 surface-card rounded-2xl" style={{ transform: "none" }}>
    <div className="flex justify-center mb-4 opacity-50" style={{ color: "var(--text-tertiary)" }}>
      {icon}
    </div>
    <p className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
      {title}
    </p>
    <p className="font-body text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
      {description}
    </p>
    {action && (
      action.to ? (
        <Link to={action.to} className="font-body text-sm hover:underline" style={{ color: "var(--accent-purple-light)" }}>
          {action.label}
        </Link>
      ) : (
        <button onClick={action.onClick} className="font-body text-sm hover:underline" style={{ color: "var(--accent-purple-light)" }}>
          {action.label}
        </button>
      )
    )}
  </div>
);

export default EmptyState;
