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
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  const start = useCallback(() => {
    const recognition = getRecognition();
    setSupported(Boolean(recognition));
    finalRef.current = "";
    setLiveText("");
    if (!recognition) return;

    recognition.lang = "lt-LT";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalRef.current = `${finalRef.current} ${result[0].transcript}`.trim();
        } else {
          interim += result[0].transcript;
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
  }, []);

  return { supported, liveText, start, stop, reset };
}
