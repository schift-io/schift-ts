/**
 * Default UI primitives — plain HTML + CSS variables.
 * Consumers can override any component via WorkflowEditorProvider's `ui` prop.
 */

import type { UIComponents } from "./adapter.js";

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

const DefaultButton: UIComponents["Button"] = ({
  variant = "default",
  size = "default",
  disabled,
  className,
  onClick,
  children,
  type = "button",
}) => {
  const base =
    "inline-flex items-center justify-center rounded font-medium transition-[background,border-color,color,box-shadow,transform] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--schift-orange)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0";
  const sizes = size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm";
  const variants: Record<string, string> = {
    default: "bg-[var(--schift-blue)] text-white hover:opacity-90",
    outline:
      "border border-[#9d9587] bg-[#fffefb] text-[var(--schift-gray-10)] shadow-[0_1px_0_rgba(32,21,21,0.06)] hover:-translate-y-px hover:border-[var(--schift-gray-10)] hover:bg-[rgba(255,79,0,0.045)]",
    ghost:
      "text-[var(--schift-gray-30)] hover:bg-[var(--schift-gray-80)] hover:text-[var(--schift-gray-10)]",
    destructive: "bg-[var(--schift-red)] text-white hover:opacity-90",
    danger:
      "border border-[var(--schift-red)]/30 text-[var(--schift-red)] bg-[var(--schift-red)]/10 hover:bg-[var(--schift-red)]/20 text-xs h-7 px-2",
    link: "text-[var(--schift-blue)] hover:underline p-0 h-auto",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(base, sizes, variants[variant], className)}
    >
      {children}
    </button>
  );
};

const DefaultInput: UIComponents["Input"] = ({
  type = "text",
  value,
  onChange,
  onBlur,
  onKeyDown,
  className,
  placeholder,
}) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    onBlur={onBlur}
    onKeyDown={onKeyDown}
    placeholder={placeholder}
    className={cn(
      "w-full px-3 bg-[var(--schift-gray-100)] border border-[var(--schift-gray-70)] rounded text-[var(--schift-gray-30)] placeholder:text-[var(--schift-gray-60)] focus:outline-none focus:border-[var(--schift-blue)]",
      className,
    )}
  />
);

const DefaultDialog: UIComponents["Dialog"] = ({ open, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      {children}
    </div>
  );
};

const DefaultDialogContent: UIComponents["DialogContent"] = ({
  onClose,
  className,
  children,
}) => (
  <div
    className={cn(
      "bg-[var(--schift-gray-90)] border border-[var(--schift-gray-70)] rounded-lg p-6 shadow-2xl",
      className,
    )}
  >
    {onClose && (
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-[var(--schift-gray-50)] hover:text-[var(--schift-white)]"
      >
        &times;
      </button>
    )}
    {children}
  </div>
);

const DefaultDialogHeader: UIComponents["DialogHeader"] = ({ children }) => (
  <div className="mb-4">{children}</div>
);

const DefaultDialogTitle: UIComponents["DialogTitle"] = ({ children }) => (
  <h3 className="text-sm font-semibold text-[var(--schift-white)]">
    {children}
  </h3>
);

const DefaultDialogDescription: UIComponents["DialogDescription"] = ({
  children,
}) => (
  <p className="text-sm text-[var(--schift-gray-50)] mt-1">{children}</p>
);

const DefaultDialogFooter: UIComponents["DialogFooter"] = ({ children }) => (
  <div className="mt-4 flex gap-2 justify-end">{children}</div>
);

const DefaultLoadingSpinner: UIComponents["LoadingSpinner"] = ({ text }) => (
  <div className="flex items-center gap-2 text-[var(--schift-gray-50)]">
    <span className="animate-spin text-lg">&orarr;</span>
    {text && <span className="text-sm">{text}</span>}
  </div>
);

const DefaultAlert: UIComponents["Alert"] = ({
  variant,
  className,
  children,
}) => (
  <div
    className={cn(
      "rounded-lg border px-4 py-3 text-sm",
      variant === "error"
        ? "border-[var(--schift-red)]/30 bg-[var(--schift-red)]/10 text-[var(--schift-red)]"
        : "border-[var(--schift-gray-70)] bg-[var(--schift-gray-90)] text-[var(--schift-gray-30)]",
      className,
    )}
  >
    {children}
  </div>
);

const DefaultCard: UIComponents["Card"] = ({ className, children }) => (
  <div
    className={cn(
      "rounded-lg border border-[rgba(197,192,177,0.58)] bg-[rgba(255,253,249,0.7)]",
      className,
    )}
  >
    {children}
  </div>
);

const DefaultCardContent: UIComponents["CardContent"] = ({
  className,
  children,
}) => <div className={cn("p-4", className)}>{children}</div>;

const DefaultErrorText: UIComponents["ErrorText"] = ({
  className,
  children,
}) => {
  if (!children) return null;
  return (
    <p className={cn("text-sm text-[var(--schift-red)]", className)}>
      {children}
    </p>
  );
};

export const DEFAULT_UI: UIComponents = {
  Button: DefaultButton,
  Input: DefaultInput,
  Dialog: DefaultDialog,
  DialogContent: DefaultDialogContent,
  DialogHeader: DefaultDialogHeader,
  DialogTitle: DefaultDialogTitle,
  DialogDescription: DefaultDialogDescription,
  DialogFooter: DefaultDialogFooter,
  LoadingSpinner: DefaultLoadingSpinner,
  Alert: DefaultAlert,
  Card: DefaultCard,
  CardContent: DefaultCardContent,
  ErrorText: DefaultErrorText,
};
