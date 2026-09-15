"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type WaveformProps = {
  stream: MediaStream | null;
  active: boolean;
  className?: string;
};

export function Waveform({ stream, active, className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let animation = 0;
    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    const drawIdle = () => {
      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);
      context.strokeStyle = "rgba(36, 48, 62, 0.18)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();
    };

    const resize = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth ?? 320;
      canvas.width = Math.floor(width * window.devicePixelRatio);
      canvas.height = Math.floor(88 * window.devicePixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = "88px";
    };

    resize();
    window.addEventListener("resize", resize);

    if (!stream || !active) {
      drawIdle();
      return () => window.removeEventListener("resize", resize);
    }

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      if (!analyser || !context) return;
      analyser.getByteFrequencyData(data);
      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);
      const bars = 42;
      const gap = 4 * window.devicePixelRatio;
      const barWidth = (width - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i += 1) {
        const value = data[Math.floor((i / bars) * data.length)] / 255;
        const barHeight = Math.max(6 * window.devicePixelRatio, value * height * 0.92);
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;
        context.fillStyle = i % 2 === 0 ? "oklch(0.48 0.1 195)" : "oklch(0.62 0.13 72)";
        context.beginPath();
        context.roundRect(x, y, barWidth, barHeight, 6 * window.devicePixelRatio);
        context.fill();
      }
      animation = window.requestAnimationFrame(draw);
    };

    void audioContext.resume();
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animation);
      source?.disconnect();
      void audioContext?.close();
    };
  }, [stream, active]);

  return <canvas ref={canvasRef} className={cn("w-full", className)} aria-hidden />;
}
