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
      const padding = 8 * window.devicePixelRatio;
      context.clearRect(0, 0, width, height);
      context.strokeStyle = "oklch(0.72 0.03 250 / 0.45)";
      context.lineWidth = 2 * window.devicePixelRatio;
      context.beginPath();
      context.moveTo(padding, height / 2);
      context.lineTo(width - padding, height / 2);
      context.stroke();
    };

    const resize = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth ?? 320;
      canvas.width = Math.floor(width * window.devicePixelRatio);
      canvas.height = Math.floor(88 * window.devicePixelRatio);
      canvas.style.width = "100%";
      canvas.style.height = "88px";
      canvas.style.display = "block";
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
      const padding = 8 * window.devicePixelRatio;
      const innerWidth = width - padding * 2;
      context.clearRect(0, 0, width, height);

      const bars = 36;
      const gap = 3 * window.devicePixelRatio;
      const barWidth = Math.max(2 * window.devicePixelRatio, (innerWidth - gap * (bars - 1)) / bars);

      for (let i = 0; i < bars; i += 1) {
        const value = data[Math.floor((i / bars) * data.length)] / 255;
        const barHeight = Math.max(4 * window.devicePixelRatio, value * height * 0.78);
        const x = padding + i * (barWidth + gap);
        const y = (height - barHeight) / 2;
        context.fillStyle = i % 2 === 0 ? "oklch(0.42 0.14 250)" : "oklch(0.58 0.08 245)";
        context.beginPath();
        context.roundRect(x, y, barWidth, barHeight, 4 * window.devicePixelRatio);
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

  return (
    <div className={cn("w-full overflow-hidden", className)}>
      <canvas ref={canvasRef} className="block w-full max-w-full" aria-hidden />
    </div>
  );
}
