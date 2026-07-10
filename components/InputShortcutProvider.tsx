"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getCustomer } from "@/lib/customers";
import { InputDrawer } from "./InputDrawer";

/**
 * The magic word. Type "harts" anywhere (outside a text field) and the weekly
 * check-in slides open — but only while viewing a live customer's pages
 * (/c/<id>/…). On the sign-in page or a coming-soon customer it does nothing,
 * and the drawer isn't mounted, so it can't reach a customer with no programmes.
 */
const MAGIC_WORD = "harts";
const TYPE_TIMEOUT_MS = 1600;

export function InputShortcutProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const buffer = useRef("");
  const lastKeyAt = useRef(0);

  const pathname = usePathname() ?? "";
  const match = pathname.match(/^\/c\/([^/]+)/);
  const customer = match ? getCustomer(decodeURIComponent(match[1])) : undefined;
  const enabled = Boolean(customer && !customer.comingSoon && customer.programmes.length > 0);

  // Leaving a live customer's pages closes anything open.
  useEffect(() => {
    if (!enabled && isOpen) setIsOpen(false);
  }, [enabled, isOpen]);

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        return;
      }
      if (isOpen) return;

      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
        buffer.current = "";
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) {
        buffer.current = "";
        return;
      }

      const now = Date.now();
      if (now - lastKeyAt.current > TYPE_TIMEOUT_MS) buffer.current = "";
      lastKeyAt.current = now;

      buffer.current = (buffer.current + e.key.toLowerCase()).slice(-MAGIC_WORD.length);
      if (buffer.current === MAGIC_WORD) {
        buffer.current = "";
        setIsOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, enabled]);

  return (
    <>
      {children}
      {enabled && <InputDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  );
}
