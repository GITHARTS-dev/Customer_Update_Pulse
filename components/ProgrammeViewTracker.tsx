"use client";

import { useEffect } from "react";
import { useCustomerApiBase } from "@/lib/use-customer";

export function ProgrammeViewTracker({ programmeId }: { programmeId: string }) {
  const apiBase = useCustomerApiBase();
  useEffect(() => {
    fetch(`${apiBase}/ceo-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "view", programmeId })
    }).catch(() => {});
  }, [apiBase, programmeId]);
  return null;
}
