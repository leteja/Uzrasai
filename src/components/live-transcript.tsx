"use client";

import type { RefObject } from "react";
import { speakerTone } from "@/lib/meeting";
import { cn } from "@/lib/utils";
import type { LiveUtterance } from "@/hooks/use-live-captions";

export function LiveTranscript({
  utterances,
  interim,
  interimSpeaker,
  recording,
  supported,
  endRef,
}: {
  utterances: LiveUtterance[];
  interim: string;
  interimSpeaker: number;
  recording: boolean;
  supported: boolean;
  endRef: RefObject<HTMLDivElement | null>;
}) {
  const empty = utterances.length === 0 && !interim;

  return (
    <div className="relative min-h-[42vh] flex-1">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="max-h-[min(62vh,640px)] overflow-y-auto py-6 pr-1">
        {!supported && recording ? (
          <p className="text-sm text-muted-foreground">Ši naršyklė nerodo gyvo teksto. Garso takelis vis tiek rašomas.</p>
        ) : empty ? (
          <p className="font-mono text-sm tracking-wide text-white/35">
            SPEAKER 1
            <span className="ml-4 font-sans tracking-normal text-white/45">Kalba atsiras čia…</span>
          </p>
        ) : (
          <ul className="space-y-5">
            {utterances.map((item, index) => {
              const tone = speakerTone(`SPEAKER_${item.speaker}`);
              const latest = index === utterances.length - 1 && !interim;
              return (
                <li key={`${index}-${item.speaker}-${item.text.slice(0, 16)}`} className="flex gap-4 sm:gap-6">
                  <span
                    className="w-[7.5rem] shrink-0 pt-0.5 font-mono text-[11px] font-semibold tracking-[0.14em]"
                    style={{ color: tone.fg }}
                  >
                    SPEAKER {item.speaker}
                  </span>
                  <p className={cn("text-[1.05rem] leading-7", latest ? "text-foreground" : "text-white/70")}>{item.text}</p>
                </li>
              );
            })}
            {interim ? (
              <li className="flex gap-4 sm:gap-6">
                <span
                  className="w-[7.5rem] shrink-0 pt-0.5 font-mono text-[11px] font-semibold tracking-[0.14em]"
                  style={{ color: speakerTone(`SPEAKER_${interimSpeaker}`).fg }}
                >
                  SPEAKER {interimSpeaker}
                </span>
                <p className="text-[1.05rem] leading-7 text-foreground">
                  {interim}
                  <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-white/80 align-middle" />
                </p>
              </li>
            ) : null}
          </ul>
        )}
        <div ref={endRef} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
