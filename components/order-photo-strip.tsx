"use client";

import { useState } from "react";
import { OrderPhotoLightbox } from "@/components/order-photo-lightbox";

const THUMB = "h-14 w-14 shrink-0";

type Props = {
  urls: string[];
  className?: string;
};

/** Рівні мініатюри (56×56); клік — на весь екран. */
export function OrderPhotoStrip({ urls, className }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (urls.length === 0) return null;

  return (
    <>
      <div className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
        {urls.map((u, i) => (
          <button
            key={u}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenIndex(i);
            }}
            className={`${THUMB} overflow-hidden rounded-lg border border-border bg-muted/30 shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <OrderPhotoLightbox
        urls={urls}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onPrev={() => setOpenIndex((i) => (i == null ? 0 : (i - 1 + urls.length) % urls.length))}
        onNext={() => setOpenIndex((i) => (i == null ? 0 : (i + 1) % urls.length))}
      />
    </>
  );
}
