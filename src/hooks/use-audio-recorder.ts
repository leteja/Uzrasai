"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "stopping";

export type RecordingResult = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const mimeRef = useRef("audio/webm");

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = useCallback(() => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  }, [stream]);

  useEffect(() => () => {
    clearTimer();
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Ši naršyklė neleidžia įrašyti mikrofono. Pabandykite Chrome arba Edge.");
      return;
    }

    setState("requesting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = pickMimeType();
      if (!mimeType) {
        media.getTracks().forEach((track) => track.stop());
        throw new Error("Naršyklė nemoka įrašyti garso šiame formate.");
      }

      mimeRef.current = mimeType;
      chunksRef.current = [];
      const recorder = new MediaRecorder(media, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(250);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setStream(media);
      setState("recording");
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      setError(
        denied
          ? "Mikrofono leidimas atmestas. Naršyklės nustatymuose leiskite mikrofoną šiai svetainei."
          : "Nepavyko įjungti mikrofono. Patikrinkite, ar jis prijungtas."
      );
      setState("idle");
    }
  }, []);

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setState("idle");
      return null;
    }

    setState("stopping");
    clearTimer();
    const durationMs = Date.now() - startedAtRef.current;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: mimeRef.current }));
      };
      recorder.stop();
    });

    recorder.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    setStream(null);
    setState("idle");
    setElapsedMs(durationMs);

    if (blob.size < 2000 || durationMs < 1500) {
      setError("Įrašas per trumpas. Palaukite bent porą sekundžių ir kalbėkite arčiau mikrofono.");
      return null;
    }

    return { blob, mimeType: mimeRef.current, durationMs };
  }, []);

  return {
    state,
    elapsedMs,
    error,
    stream,
    start,
    stop,
    stopTracks,
    setError,
    isRecording: state === "recording",
  };
}
