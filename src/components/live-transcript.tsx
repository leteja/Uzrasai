"use client";

import type { RefObject } from "react";
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
  if (!recording && empty) return null;

  return (
    <div className="mx-auto w-full max-w-2xl px-2">
      {!supported && recording ? (
        <p className="text-center text-white/45">Garsas rašomas.</p>
      ) : (
        <div className="max-h-[40vh] overflow-y-auto text-[1.35rem] leading-snug text-white sm:text-[1.6rem]">
          {utterances.map((item, index) => (
            <p key={`${index}-${item.speaker}`} className="mb-4">
              <span className="mr-3 font-mono text-[11px] tracking-[0.16em] text-white/50">SPEAKER {item.speaker}</span>
              {item.text}
            </p>
          ))}
          {interim ? (
            <p className="mb-4">
              <span className="mr-3 font-mono text-[11px] tracking-[0.16em] text-white/50">SPEAKER {interimSpeaker}</span>
              {interim}
              <span className="ml-1 inline-block h-[1em] w-[2px] animate-pulse bg-white align-[-0.1em]" />
            </p>
          ) : recording ? (
            <span className="inline-block h-[1em] w-[2px] animate-pulse bg-white/80" />
          ) : null}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
