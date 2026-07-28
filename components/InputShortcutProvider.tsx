"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getCustomer } from "@/lib/customers";
import { InputDrawer } from "./InputDrawer";
import { ShortcutChooser } from "./ShortcutChooser";
import { useEditMode } from "./EditModeProvider";

/**
 * The magic word. Type "harts" anywhere (outside a text field) and a small
 * chooser opens - but only while viewing a live customer's pages (/c/<id>/…).
 * On the sign-in page or a coming-soon customer it does nothing, and the
 * drawer isn't mounted, so it can't reach a customer with no programmes.
 *
 * Two things sit behind the word now: adding a check-in, and editing how an
 * already-published one reads. The chooser exists so that fork is a visible
 * choice rather than a hidden mode.
 */
const MAGIC_WORD = "harts";
const TYPE_TIMEOUT_MS = 1600;

export function InputShortcutProvider({ children }: { children: React.ReactNode }) {
  const [chooserOpen, setChooserOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const buffer = useRef("");
  const lastKeyAt = useRef(0);

  const pathname = usePathname() ?? "";
  const match = pathname.match(/^\/c\/([^/]+)/);
  const customer = match ? getCustomer(decodeURIComponent(match[1])) : undefined;
  const enabled = Boolean(customer && !customer.comingSoon && customer.programmes.length > 0);

  const { editMode, enterEditMode, available: editAvailable } = useEditMode();

  // Editing only makes sense on the pages that actually render published
  // cards: the pulse page and a programme page. `editAvailable` also goes false
  // while a past checkpoint is on screen, so the option is offered as disabled
  // rather than letting someone try to rewrite history.
  const canEdit =
    editAvailable && /^\/c\/[^/]+(\/programme\/[^/]+)?\/?$/.test(pathname);

  // Leaving a live customer's pages closes anything open.
  useEffect(() => {
    if (enabled) return;
    setChooserOpen(false);
    setDrawerOpen(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && chooserOpen) {
        setChooserOpen(false);
        return;
      }
      // The drawer handles its own Escape - only it knows whether closing
      // would discard a filled-in batch and should confirm first.
      // Anything already open owns the keyboard - including edit mode, where
      // the bar's own Discard/Publish is the way out.
      if (chooserOpen || drawerOpen || editMode) return;

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
        setChooserOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chooserOpen, drawerOpen, editMode, enabled]);

  return (
    <>
      {children}
      {enabled && (
        <>
          <ShortcutChooser
            isOpen={chooserOpen}
            canEdit={canEdit}
            onClose={() => setChooserOpen(false)}
            onChooseInput={() => {
              setChooserOpen(false);
              setDrawerOpen(true);
            }}
            onChooseEdit={() => {
              setChooserOpen(false);
              enterEditMode();
            }}
          />
          <InputDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </>
      )}
    </>
  );
}
