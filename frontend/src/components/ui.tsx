import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

// Primary carries a violet→fuchsia gradient and lifts on hover; the rest stay quieter so a single
// obvious action reads first on any given screen.
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/25 hover:shadow-lg hover:shadow-violet-500/35 hover:-translate-y-0.5 active:translate-y-0 disabled:from-violet-300 disabled:to-fuchsia-300 disabled:shadow-none disabled:translate-y-0",
  secondary:
    "bg-white text-slate-700 border border-slate-200 shadow-sm hover:border-violet-300 hover:text-violet-700 hover:shadow disabled:opacity-50",
  danger:
    "bg-white text-rose-600 border border-rose-200 shadow-sm hover:bg-rose-50 hover:border-rose-300 disabled:opacity-50",
  ghost: "text-slate-600 hover:text-violet-700 hover:bg-violet-50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}

const fieldClasses =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-100";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClasses} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClasses} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClasses} cursor-pointer ${props.className ?? ""}`} />;
}

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

const badgeTones = {
  gray: "bg-slate-100 text-slate-600 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  indigo: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

// Placeholder rows shaped roughly like the list they stand in for, so the page doesn't visibly
// jump from an empty state to content once the request lands.
export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-5 w-2/5 mb-2.5" />
          <Skeleton className="h-4 w-3/5" />
        </Card>
      ))}
    </div>
  );
}

export function PageHeading({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-3xl font-extrabold bg-gradient-to-r from-violet-700 via-fuchsia-600 to-violet-700 bg-clip-text text-transparent">
        {children}
      </h1>
      {subtitle && <p className="text-slate-500 mt-1.5">{subtitle}</p>}
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3.5 py-2.5 font-medium">
      {children}
    </p>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3.5 py-2.5 font-medium">
      {children}
    </p>
  );
}
