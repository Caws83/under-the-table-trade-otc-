"use client";

import { createContext, useContext, useMemo, useState } from "react";

type Tone = "ok" | "err" | "info";
type Toast = { id: number; text: string; tone: Tone };

const ToastContext = createContext<{ push: (text: string, tone?: Tone) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const api = useMemo(
    () => ({
      push(text: string, tone: Tone = "info") {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setToasts((current) => [...current, { id, text, tone }]);
        window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5200);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast ${toast.tone}`} key={toast.id}>
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
