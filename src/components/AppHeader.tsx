"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ResolvedStream } from "@/lib/streams/types";
import { CloseIcon } from "./icons";
import { ProviderBadge } from "./ProviderBadge";

const PANEL_ID = "channel-panel";

interface AppHeaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Idle auto-hide (only honoured while collapsed). */
  hidden: boolean;
  nowPlaying: ResolvedStream | null;
  /** Panel contents (stream selector, catalog info). */
  children: ReactNode;
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/**
 * Fixed top bar over the full-screen player: hamburger, title and a "now playing" readout.
 * The hamburger reveals a translucent channel panel that overlays the video without reflowing it.
 */
export function AppHeader({ open, onOpenChange, hidden, nowPlaying, children }: AppHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusPanelOnOpen = useRef(false);
  const wasOpen = useRef(open);

  // Focus moves into the panel when the user opens it, and back to the hamburger on close.
  useEffect(() => {
    if (open && !wasOpen.current && focusPanelOnOpen.current) {
      focusPanelOnOpen.current = false;
      const panel = panelRef.current;
      const target =
        panel?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
        panel?.querySelector<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])");
      (target ?? panel)?.focus({ preventScroll: true });
    } else if (!open && wasOpen.current) {
      const active = document.activeElement;
      // Don't steal focus from something the user just moved to outside the header (e.g. a PiP tile).
      if (!active || active === document.body || panelRef.current?.contains(active)) {
        toggleRef.current?.focus({ preventScroll: true });
      }
    }
    wasOpen.current = open;
  }, [open]);

  // Escape or a press outside the header closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !headerRef.current?.contains(e.target)) onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onOpenChange]);

  const faded = hidden && !open;

  return (
    <>
      {/* Catches presses over the video (including cross-origin iframes) while the panel is open. */}
      {open && <div className="fixed inset-0 z-30" aria-hidden />}

      <header
        ref={headerRef}
        data-keep-awake
        className={`fixed inset-x-0 top-0 z-40 transition-[opacity,translate,background-color] duration-300 ease-out motion-reduce:transition-none ${
          open
            ? "border-b border-white/10 bg-zinc-950/75 shadow-2xl shadow-black/60 backdrop-blur-xl"
            : "bg-gradient-to-b from-black/70 via-black/30 to-transparent"
        } ${faded ? "pointer-events-none -translate-y-2 opacity-0" : "opacity-100"}`}
      >
        <div className="safe-pt safe-px">
          <div className="mx-auto flex h-(--bar-h) w-full max-w-6xl items-center gap-3">
            <button
              ref={toggleRef}
              type="button"
              aria-expanded={open}
              aria-controls={PANEL_ID}
              aria-label={open ? "Hide channels" : "Show channels"}
              onClick={() => {
                focusPanelOnOpen.current = !open;
                onOpenChange(!open);
              }}
              className="-ml-1.5 rounded-full p-2 text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-red-500"
            >
              {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600 shadow-[0_0_10px] shadow-red-600" aria-hidden />
              <h1 className="text-base font-black tracking-tight text-white drop-shadow sm:text-lg">Live TV News</h1>
            </div>
            {nowPlaying && !open && (
              <p className="ml-auto flex min-w-0 items-center gap-2 text-sm text-white drop-shadow" aria-live="polite">
                <span className="sr-only">Now playing:</span>
                <ProviderBadge providerId={nowPlaying.providerId} size="sm" />
                <span className="truncate font-medium">{nowPlaying.name}</span>
              </p>
            )}
          </div>
        </div>

        <div
          id={PANEL_ID}
          ref={panelRef}
          role="region"
          aria-label="Channels"
          tabIndex={-1}
          inert={!open}
          className={`grid outline-none transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="safe-px max-h-[70dvh] overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-6xl pt-1 pb-4">{children}</div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
