// Thin loader for the feedback-tracker browser widget.
//
// The widget JS itself is served by the feedback-tracker collector at
// `<collectorUrl>/widget/feedback-widget.js` and exposes `window.FeedbackWidget`.
// This package just injects that script and inits it — so the console doesn't
// vendor the widget source.

export interface FeedbackWidgetInit {
  app: string;
  collectorUrl?: string;
  publishableKey?: string;
  accent?: string;
  title?: string;
  prompt?: string;
  meta?: Record<string, unknown>;
  fab?: boolean;
}

export interface FeedbackWidgetApi {
  init(opts: FeedbackWidgetInit): void;
  open(): void;
  close(): void;
  submit(item: Record<string, unknown>): void;
  drain(): void;
}

declare global {
  interface Window {
    FeedbackWidget?: FeedbackWidgetApi;
  }
}

/** Inject the collector-served widget script and init it. Idempotent (no-op on the server). */
export function loadFeedbackWidget(opts: FeedbackWidgetInit & { collectorUrl: string }): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const src = `${opts.collectorUrl.replace(/\/$/, "")}/widget/feedback-widget.js`;
  const doInit = () => window.FeedbackWidget?.init(opts);

  const existing = document.querySelector<HTMLScriptElement>("script[data-ap-feedback]");
  if (existing) {
    if (window.FeedbackWidget) doInit();
    else existing.addEventListener("load", doInit);
    return;
  }
  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.dataset.apFeedback = "1";
  s.addEventListener("load", doInit);
  document.head.appendChild(s);
}
