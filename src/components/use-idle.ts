"use client";

import { useEffect, useState } from "react";

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel", "focusin"] as const;

/** Focus inside a `[data-keep-awake]` region keeps the UI visible, but only for keyboard focus. */
function focusKeepsAwake(): boolean {
  const el = document.activeElement;
  if (!el || el === document.body || !el.closest("[data-keep-awake]")) return false;
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * True after `timeoutMs` without pointer, touch, wheel or keyboard activity while `enabled`.
 * Any activity resets it. Always false while disabled.
 */
export function useIdle(timeoutMs: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (focusKeepsAwake()) arm();
        else setIdle(true);
      }, timeoutMs);
    };
    const wake = () => {
      setIdle(false);
      arm();
    };
    arm();
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, wake, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, wake);
      setIdle(false);
    };
  }, [timeoutMs, enabled]);

  return enabled && idle;
}
