"use client";

import { useEffect, useState } from "react";
import { HiKontaIcon } from "@/components/shared/hikonta-icon";
import { HiKontaTitle } from "@/components/shared/hikonta-title";

const doubts = [
  "¿Ya me pagó?",
  "¿Ya envié ese pedido?",
  "¿Todavía tengo ese producto?",
  "¿Realmente estoy ganando dinero?",
];

// Continues the "Con hikonta ___" sentence above it — cycles so the
// benefit shown isn't always "evita errores.".
const outcomes = ["recupera el control.", "haz crecer tu negocio.", "evita errores."];
const OUTCOME_INTERVAL_MS = 2600;

export function LandingErrorRelief() {
  const [outcomeIndex, setOutcomeIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setOutcomeIndex((i) => (i + 1) % outcomes.length);
    }, OUTCOME_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="bg-white pt-2">
      <div className="relative overflow-hidden rounded-t-[36px] bg-[radial-gradient(ellipse_22%_55%_at_-4%_51%,rgba(114,231,234,0.45)_0%,rgba(114,231,234,0.34)_35%,transparent_72%),radial-gradient(circle_at_103%_48%,rgba(95,177,255,0.32)_0%,rgba(95,177,255,0.25)_8%,transparent_15%),linear-gradient(153deg,#b7fbf2_0%,#99baff_28%,#c7d2ff_46%,#f7f8ff_66%,#ffffff_86%)] px-5 py-10 shadow-[0_-40px_60px_-24px_rgba(153,186,255,0.5),0_40px_60px_-24px_rgba(153,186,255,0.5)] sm:px-8 lg:rounded-t-[52px] lg:py-12">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="lg:pl-2">
            <h2 className="text-3xl font-normal leading-none text-black sm:text-4xl">
              Olvídate del
            </h2>
            <div className="mt-5 flex max-w-md flex-col items-start gap-4">
              {doubts.map((item, index) => (
                <div
                  key={item}
                  className="relative max-w-full rounded-lg bg-white/85 px-4 py-2.5 text-base leading-none text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.14)] backdrop-blur sm:text-[20px]"
                >
                  {item}
                  <span
                    className={
                      index % 2 === 0
                        ? "absolute -bottom-2 left-0 h-0 w-0 border-r-15 border-t-15 border-r-transparent border-t-white/85"
                        : "absolute -bottom-2 right-0 h-0 w-0 border-l-15 border-t-15 border-l-transparent border-t-white/85"
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center lg:justify-end lg:pr-10">
            <div className="text-center w-full max-w-100">
              <div className="flex items-center justify-center gap-3 text-4xl font-normal leading-none text-zinc-900 sm:text-5xl">
                <span>Con</span>
                <HiKontaIcon className="size-12 rounded-full sm:size-14" />
                <HiKontaTitle className="h-8 sm:h-10" />
              </div>
              {/* Fixed (not min-) height sized to the tallest phrase's 2
                  lines, so this box never grows/shrinks as the phrase
                  changes — otherwise the "Con hikonta" row above would
                  shift up or down whenever a longer phrase wraps. */}
              <div className="mt-2 h-18 text-4xl font-extrabold leading-none sm:h-24 sm:text-5xl">
                <span
                  key={outcomeIndex}
                  className="landing-rotate-word inline-block bg-linear-to-r from-[#0a1233] via-[#0068ff] to-[#22d3ee] bg-clip-text text-transparent"
                >
                  {outcomes[outcomeIndex]}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
