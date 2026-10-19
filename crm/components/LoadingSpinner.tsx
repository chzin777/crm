interface LoadingSpinnerProps {
  label: string;
  size?: number;
  fullScreen?: boolean;
  className?: string;
}

export function LoadingSpinner({
  label,
  size = 56,
  fullScreen = false,
  className = "",
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`${fullScreen
        ? "flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f4f5f8] text-sm font-medium text-[#051647] dark:bg-[#030d29] dark:text-[#C4D600]"
        : "flex items-center gap-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300"} ${className}`}
    >
      <svg
        className="crm-loader shrink-0"
        width={size}
        height={size}
        viewBox="0 0 240 240"
        fill="none"
        aria-hidden="true"
      >
        <circle className="crm-loader__ring crm-loader__ring--a" cx="120" cy="120" r="105" strokeWidth="20" strokeDasharray="0 660" strokeDashoffset="-330" strokeLinecap="round" />
        <circle className="crm-loader__ring crm-loader__ring--b" cx="120" cy="120" r="35" strokeWidth="20" strokeDasharray="0 220" strokeDashoffset="-110" strokeLinecap="round" />
        <circle className="crm-loader__ring crm-loader__ring--c" cx="85" cy="120" r="70" strokeWidth="20" strokeDasharray="0 440" strokeLinecap="round" />
        <circle className="crm-loader__ring crm-loader__ring--d" cx="155" cy="120" r="70" strokeWidth="20" strokeDasharray="0 440" strokeLinecap="round" />
      </svg>
      <span>{label}</span>
    </div>
  );
}
