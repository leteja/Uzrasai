"use client";

import { useCallback, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type LiveUtterance = {
  speaker: number;
  text: string;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

const TURN_GAP_MS = 1400;

export function useLiveCaptions() {
  const [supported, setSupported] = useState(true);
  const [liveText, setLiveText] = useState("");
  const [utterances, setUtterances] = useState<LiveUtterance[]>([]);
  const [interim, setInterim] = useState("");
  const [interimSpeaker, setInterimSpeaker] = useState(1);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const runningRef = useRef(false);
  const speakerRef = useRef(1);
  const lastSpeechAtRef = useRef(0);
  const maxRef = useRef(6);

  const maybeAdvanceSpeaker = () => {
    const now = Date.now();
    if (lastSpeechAtRef.current && now - lastSpeechAtRef.current > TURN_GAP_MS) {
      const max = Math.max(1, maxRef.current);
      speakerRef.current = (speakerRef.current % max) + 1;
    }
    lastSpeechAtRef.current = now;
  };

  const start = useCallback((maxSpeakers = 6) => {
    const recognition = getRecognition();
    setSupported(Boolean(recognition));
    finalRef.current = "";
    setLiveText("");
    setUtterances([]);
    setInterim("");
    setInterimSpeaker(1);
    speakerRef.current = 1;
    lastSpeechAtRef.current = 0;
    maxRef.current = Math.min(8, Math.max(1, maxSpeakers));
    runningRef.current = true;
    if (!recognition) return;

    const bind = (instance: SpeechRecognitionLike) => {
      instance.lang = "lt-LT";
      instance.continuous = true;
      instance.interimResults = true;
      instance.onresult = (event) => {
        maybeAdvanceSpeaker();
        let nextInterim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const piece = result[0].transcript.trim();
          if (!piece) continue;
          if (result.isFinal) {
            finalRef.current = `${finalRef.current} ${piece}`.trim();
            const speaker = speakerRef.current;
            setUtterances((current) => {
              const last = current[current.length - 1];
              if (last && last.speaker === speaker) {
                return [...current.slice(0, -1), { speaker, text: `${last.text} ${piece}`.trim() }];
              }
              return [...current, { speaker, text: piece }];
            });
          } else {
            nextInterim += `${piece} `;
          }
        }
        setInterim(nextInterim.trim());
        setInterimSpeaker(speakerRef.current);
        setLiveText(`${finalRef.current} ${nextInterim}`.trim());
      };
      instance.onerror = () => undefined;
      instance.onend = () => {
        if (!runningRef.current) return;
        try {
          instance.start();
        } catch {
          window.setTimeout(() => {
            if (!runningRef.current) return;
            try {
              instance.start();
            } catch {
              // give up until next Start
            }
          }, 250);
        }
      };
    };

    bind(recognition);
    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setSupported(false);
      runningRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
    recognitionRef.current = null;
    return finalRef.current.trim();
  }, []);

  const reset = useCallback(() => {
    runningRef.current = false;
    finalRef.current = "";
    setLiveText("");
    setUtterances([]);
    setInterim("");
    setInterimSpeaker(1);
    speakerRef.current = 1;
    lastSpeechAtRef.current = 0;
  }, []);

  return { supported, liveText, utterances, interim, interimSpeaker, start, stop, reset };
}
