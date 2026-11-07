import Image from "next/image";
import type { ProviderId } from "@/lib/streams/types";

/*
 * Network logos live in /public/logos. They are the official marks from Wikimedia Commons
 * (File:NBC_logo.svg, File:American_Broadcasting_Company_Logo.svg, File:CBS_logo.svg),
 * stripped of editor metadata, and are used only to identify each network (nominative use).
 * They render full-colour on a small white chip so they stay legible over dark video.
 */
const LOGOS: Record<ProviderId, { name: string; src: string; width: number; height: number }> = {
  nbc: { name: "NBC", src: "/logos/nbc.svg", width: 567, height: 559 },
  abc: { name: "ABC", src: "/logos/abc.svg", width: 202, height: 202 },
  cbs: { name: "CBS", src: "/logos/cbs.svg", width: 240, height: 70 },
};

const SIZES = {
  sm: { chip: "rounded px-1 py-0.5", logo: "h-3" },
  md: { chip: "rounded-md px-1.5 py-0.5", logo: "h-4" },
  lg: { chip: "rounded-md px-2 py-1", logo: "h-6" },
} as const;

export function ProviderBadge({
  providerId,
  size = "md",
  decorative = false,
  className = "",
}: {
  providerId: ProviderId;
  size?: keyof typeof SIZES;
  /** Set when a visible network label sits next to the badge, so the logo is hidden from assistive tech. */
  decorative?: boolean;
  className?: string;
}) {
  const logo = LOGOS[providerId];
  const s = SIZES[size];
  return (
    <span className={`inline-flex shrink-0 items-center bg-white shadow-sm ring-1 ring-black/10 ${s.chip} ${className}`}>
      <Image
        src={logo.src}
        alt={decorative ? "" : logo.name}
        width={logo.width}
        height={logo.height}
        unoptimized
        draggable={false}
        className={`${s.logo} w-auto`}
      />
    </span>
  );
}
