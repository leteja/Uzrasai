"use client";

import { useCallback, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
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

export function useLiveCaptions() {
  const [supported, setSupported] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [finalLines, setFinalLines] = useState<string[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  const start = useCallback(() => {
    const recognition = getRecognition();
    setSupported(Boolean(recognition));
    finalRef.current = "";
    setLiveText("");
    setFinalLines([]);
    if (!recognition) return;

    recognition.lang = "lt-LT";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const piece = result[0].transcript.trim();
        if (!piece) continue;
        if (result.isFinal) {
          finalRef.current = `${finalRef.current} ${piece}`.trim();
          setFinalLines((current) => [...current, piece]);
        } else {
          interim += piece;
        }
      }
      setLiveText(`${finalRef.current} ${interim}`.trim());
    };
    recognition.onerror = () => undefined;
    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setSupported(false);
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
    recognitionRef.current = null;
    return finalRef.current.trim();
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setLiveText("");
    setFinalLines([]);
  }, []);

  return { supported, liveText, finalLines, start, stop, reset };
}
