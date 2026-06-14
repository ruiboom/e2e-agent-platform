"use client";
import { useEffect } from "react";

import { loadFeedbackWidget } from "@agent-platform/feedback-widget";

// Mounts the collector-served feedback widget over every console route.
export function FeedbackMount() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_FEEDBACK_TRACKER_URL;
    if (url) loadFeedbackWidget({ app: "console", collectorUrl: url, accent: "#006a4d" });
  }, []);
  return null;
}
