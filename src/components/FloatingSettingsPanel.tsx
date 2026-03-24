import { useEffect, useRef, type ReactNode } from "react";

interface FloatingSettingsPanelProps {
  children: ReactNode;
  title?: string;
}

export function FloatingSettingsPanel({
  children,
  title = "Settings",
}: FloatingSettingsPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    const wrapper = wrapperRef.current;
    if (!content || !wrapper) return;

    const applyHeight = () => {
      // Clip overflow only during the animation
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
    <div className="fixed right-6 top-1/2 -translate-y-1/2 z-20 w-72 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_1px_rgba(0,0,0,0.1)] border border-slate-200/80 p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-5">{title}</h3>
      <div
        ref={wrapperRef}
        className="overflow-visible transition-[height] duration-300 ease-in-out"
      >
        <div ref={contentRef} className="space-y-5">
          {children}
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
