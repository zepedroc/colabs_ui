import { SquarePen, Trash2 } from "lucide-react";

export type SessionHistorySidebarItem = {
  sessionId: string;
  prompt: string;
  untitledFallback: string;
  modelsSummary: string;
  startedAt: number;
  badgeLabel: string;
  badgeClassName: string;
};

type SessionHistorySidebarProps = {
  title: string;
  sessions: SessionHistorySidebarItem[];
  activeSessionId: string;
  deletingSessionId: string | null;
  isSubmitting: boolean;
  emptyMessage: string;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewChat: () => void;
  newChatAriaLabel?: string;
  newChatTitle?: string;
  deleteButtonAriaLabel?: string;
  promptTruncateLength?: number;
};

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function formatSessionDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionHistorySidebar({
  title,
  sessions,
  activeSessionId,
  deletingSessionId,
  isSubmitting,
  emptyMessage,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  newChatAriaLabel = "New chat",
  newChatTitle,
  deleteButtonAriaLabel = "Delete chat",
  promptTruncateLength = 80,
}: SessionHistorySidebarProps) {
  return (
    <aside className="fixed left-4 top-20 bottom-28 z-20 hidden w-72 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg backdrop-blur lg:flex">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500">{sessions.length} chats</p>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          disabled={isSubmitting}
          title={newChatTitle ?? newChatAriaLabel}
          aria-label={newChatAriaLabel}
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-40"
        >
          <SquarePen className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => {
              const isActive = session.sessionId === activeSessionId;
              const prompt = session.prompt.trim() ? session.prompt : session.untitledFallback;
              const isDeleting = deletingSessionId === session.sessionId;
              return (
                <div
                  key={session.sessionId}
                  className={[
                    "relative rounded-xl border transition-colors",
                    isActive
                      ? "border-primary/30 bg-primary/5"
                      : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(session.sessionId)}
                    disabled={isSubmitting || isDeleting}
                    className="w-full px-3 py-2.5 pr-10 text-left"
                  >
                    <div className="mb-1">
                      <span
                        className={[
                          "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          session.badgeClassName,
                        ].join(" ")}
                      >
                        {session.badgeLabel}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-800">
                      {truncateText(prompt, promptTruncateLength)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">{session.modelsSummary}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatSessionDate(session.startedAt)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(session.sessionId)}
                    disabled={isSubmitting || isDeleting}
                    className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                    aria-label={deleteButtonAriaLabel}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
