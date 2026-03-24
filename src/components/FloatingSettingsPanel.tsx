import { useEffect, useRef, useState, type ReactNode } from "react";
import { Settings2, X } from "lucide-react";

interface FloatingSettingsPanelProps {
  children: ReactNode;
  title?: string;
  open?: boolean;
}

export function FloatingSettingsPanel({
  children,
  title = "Settings",
  open: externalOpen,
}: FloatingSettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Allow parent to close the panel
  useEffect(() => {
    if (externalOpen === false) {
      setIsOpen(false);
    }
  }, [externalOpen]);

  // Animate inner content height changes (e.g. coding artifact toggle appearing)
  useEffect(() => {
    const content = contentRef.current;
    const wrapper = wrapperRef.current;
    if (!content || !wrapper) return;

    const applyHeight = () => {
      wrapper.style.overflow = "hidden";
      const height = content.scrollHeight;
      wrapper.style.height = `${height}px`;

      const onEnd = () => {
        wrapper.style.overflow = "visible";
      };
      wrapper.addEventListener("transitionend", onEnd, { once: true });
    };

    applyHeight();

    const ro = new ResizeObserver(() => {
      applyHeight();
    });
    ro.observe(content);

    return () => {
      ro.disconnect();
    };
  }, []);

  return (
    <div className="fixed right-6 top-1/2 -translate-y-1/2 z-20">
      {/* Collapsed gear button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.1),0_0_1px_rgba(0,0,0,0.1)] border border-slate-200/80 text-slate-500 hover:text-slate-700 hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)] transition-all duration-300 ${
          isOpen ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100"
        }`}
        aria-label="Open settings"
      >
        <Settings2 className="h-5 w-5" />
      </button>

      {/* Expanded panel */}
      <div
        className={`w-72 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_1px_rgba(0,0,0,0.1)] border border-slate-200/80 p-5 origin-right transition-all duration-300 ease-in-out ${
          isOpen
            ? "scale-100 opacity-100 translate-x-0"
            : "scale-95 opacity-0 translate-x-4 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          ref={wrapperRef}
          className="overflow-visible transition-[height] duration-300 ease-in-out"
        >
          <div ref={contentRef} className="space-y-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SettingsFieldProps {
  label: string;
  children: ReactNode;
}

export function SettingsField({ label, children }: SettingsFieldProps) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      {children}
    </div>
  );
}
