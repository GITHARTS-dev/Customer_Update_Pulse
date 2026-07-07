"use client";

import { useEffect } from "react";

export function ProgrammeViewTracker({ programmeId }: { programmeId: string }) {
  useEffect(() => {
    fetch("/api/ceo-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "view", programmeId })
    }).catch(() => {});
  }, [programmeId]);
  return null;
}
