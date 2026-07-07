"use client";

import { useEffect, useRef, useState } from "react";
import { InputDrawer } from "./InputDrawer";

/**
 * The magic word. Type "harts" anywhere (outside a text field)
 * and the weekly check-in slides open.
 */
const MAGIC_WORD = "harts";
const TYPE_TIMEOUT_MS = 1600;

export function InputShortcutProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const buffer = useRef("");
  const lastKeyAt = useRef(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        return;
      }
      if (isOpen) return;

      // Never hijack real typing
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
        buffer.current = "";
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Only single letters feed the magic word
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
  }, [isOpen]);

  return (
    <>
      {children}
      <InputDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
