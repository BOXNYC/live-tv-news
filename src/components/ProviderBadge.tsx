import type { ProviderId } from "@/lib/streams/types";

const STYLES: Record<ProviderId, string> = {
  nbc: "bg-gradient-to-r from-amber-400 via-rose-500 to-sky-500 text-white",
  abc: "bg-zinc-100 text-zinc-950",
  cbs: "bg-sky-700 text-white",
};

export function ProviderBadge({
  providerId,
  size = "md",
}: {
  providerId: ProviderId;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded font-black uppercase tracking-wider ${STYLES[providerId]} ${
        size === "sm" ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[11px]"
      }`}
    >
      {providerId}
    </span>
  );
}
