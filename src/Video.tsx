// One component for both formats: 9:16 stacks stage over captions, 16:9 gives the stage the full width.
import React, { createContext, useContext, useMemo } from "react";
import { AbsoluteFill, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { FPS, SceneProps, VideoProps, Word } from "./types";
import { Background, Foreground } from "./Visuals";

export const sans = loadFont("normal", { weights: ["500", "700", "800", "900"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Layout = { tall: boolean; accent: string; text: string; muted: string; stage: { top: number; height: number; side: number } };
const LayoutContext = createContext<Layout | null>(null);
export const useLayout = () => useContext(LayoutContext)!;

export const Video: React.FC<VideoProps> = (props) => {
  const { width, height } = useVideoConfig();
  const tall = height > width;
  const layout: Layout = {
    tall,
    accent: props.accent,
    text: "#f2f5ff",
    muted: "#8d97b8",
    stage: tall ? { top: 250, height: 1080, side: 80 } : { top: 150, height: 700, side: 140 },
  };
  return (
    <LayoutContext.Provider value={layout}>
      <AbsoluteFill style={{ backgroundColor: props.background, fontFamily: sans, color: layout.text }}>
        <Glow scenes={props.scenes} accent={props.accent} />
        {props.scenes.map((s, i) => (
          <SceneSlot key={s.id + i} scene={s} last={i === props.scenes.length - 1} layer="back" />
        ))}
        {props.scenes.map((s, i) => (
          <SceneSlot key={s.id + i} scene={s} last={i === props.scenes.length - 1} layer="front" />
        ))}
        <Progress scenes={props.scenes} title={props.title} total={props.durationInFrames} />
        <Captions words={props.captions} />
        {props.audio ? <Audio src={staticFile(props.audio)} /> : null}
      </AbsoluteFill>
    </LayoutContext.Provider>
  );
};

// Each scene lives in its own Sequence; it slides in and fades out over the next scene's entrance.
const SceneSlot: React.FC<{ scene: SceneProps; last: boolean; layer: "back" | "front" }> = ({ scene, last, layer }) => {
  const from = Math.round(scene.start * FPS);
  const dur = Math.round(scene.dur * FPS) + (last ? 0 : 8);
  const hasBack = Boolean(scene.visual.image || scene.visual.video);
  if (layer === "back" && !hasBack) return null;
  return (
    <Sequence from={from} durationInFrames={dur} layout="none">
      <Fade dur={dur} last={last} slide={layer === "front"}>
        {layer === "back" ? <Background visual={scene.visual} dur={scene.dur} /> : <Foreground visual={scene.visual} dur={scene.dur} overMedia={hasBack} />}
      </Fade>
    </Sequence>
  );
};

const Fade: React.FC<{ dur: number; last: boolean; slide: boolean; children: React.ReactNode }> = ({ dur, last, slide, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.7 } });
  const exit = last ? 1 : interpolate(frame, [dur - 8, dur], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: Math.min(enter * 1.4, 1) * exit, transform: slide ? `translateY(${(1 - enter) * 60}px)` : undefined }}>
      {children}
    </AbsoluteFill>
  );
};

// Two soft blobs of the accent colour drift to a new spot on every scene, so the frame never sits still.
const Glow: React.FC<{ scenes: SceneProps[]; accent: string }> = ({ scenes, accent }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / FPS;
  const spots = scenes.map((_, i) => [((i * 0.37) % 1) * 0.8 + 0.1, ((i * 0.61) % 1) * 0.6 + 0.2]);
  const times = scenes.map((s) => s.start);
  const pos = (k: 0 | 1) => (times.length > 1 ? interpolate(t, times, spots.map((p) => p[k])) : spots[0][k]);
  const x = pos(0) * width + Math.sin(t * 0.6) * 40;
  const y = pos(1) * height + Math.cos(t * 0.5) * 40;
  const r = Math.max(width, height) * 0.45;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}33 0%, ${accent}00 65%)` }} />
      <div style={{ position: "absolute", left: width - x - r * 0.7, top: height - y - r * 0.7, width: r * 1.4, height: r * 1.4, borderRadius: "50%",
        background: "radial-gradient(circle, #6b7cff2a 0%, #6b7cff00 65%)" }} />
      <AbsoluteFill style={{ opacity: 0.05, backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
        backgroundSize: "72px 72px", backgroundPosition: `0 ${(t * 12) % 72}px` }} />
    </AbsoluteFill>
  );
};

// Progress: one segment per scene, filled as the video plays, plus a scene counter.
const Progress: React.FC<{ scenes: SceneProps[]; title: string; total: number }> = ({ scenes, title, total }) => {
  const frame = useCurrentFrame();
  const { tall, accent, muted } = useLayout();
  const t = frame / FPS;
  const current = Math.max(0, scenes.findIndex((s) => t >= s.start && t < s.start + s.dur));
  const top = tall ? 120 : 56;
  const side = tall ? 80 : 140;
  const end = total / FPS;
  return (
    <div style={{ position: "absolute", top, left: side, right: side }}>
      <div style={{ display: "flex", gap: 8 }}>
        {scenes.map((s, i) => {
          const segEnd = i + 1 < scenes.length ? scenes[i + 1].start : end;
          const fill = interpolate(t, [s.start, segEnd], [0, 1], clamp);
          return (
            <div key={i} style={{ flex: segEnd - s.start, height: 8, borderRadius: 4, background: "#ffffff1f", overflow: "hidden" }}>
              <div style={{ width: `${fill * 100}%`, height: "100%", background: accent }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontFamily: mono, fontSize: tall ? 30 : 24, color: muted, fontWeight: 500 }}>
        <span>{title}</span>
        <span>
          <span style={{ color: accent }}>{String(current + 1).padStart(2, "0")}</span> / {String(scenes.length).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
};

// Captions: short chunks (a punctuation mark always closes one), the word being spoken is highlighted.
const chunk = (words: Word[], maxWords: number, maxChars: number): Word[][] => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const len = cur.reduce((n, x) => n + x.text.length + 1, 0);
    if (cur.length && (cur.length >= maxWords || len + w.text.length > maxChars)) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.,?:;!]$/.test(w.text)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
};

const Captions: React.FC<{ words: Word[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { tall, accent, text } = useLayout();
  const ms = (frame / FPS) * 1000;
  const chunks = useMemo(() => (tall ? chunk(words, 3, 18) : chunk(words, 5, 34)), [words, tall]);
  const idx = chunks.findIndex((c, i) => {
    const start = c[0].startMs - 50;
    const stop = Math.min(chunks[i + 1] ? chunks[i + 1][0].startMs - 50 : Infinity, c[c.length - 1].endMs + 600);
    return ms >= start && ms < stop;
  });
  if (idx < 0) return null;
  const c = chunks[idx];
  const size = tall ? 84 : 60;
  const pop = interpolate(ms - c[0].startMs, [-50, 120], [0.85, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 60, right: 60, ...(tall ? { top: 1400 } : { bottom: 70 }), display: "flex", justifyContent: "center",
      flexWrap: "wrap", gap: `0 ${size * 0.28}px`, transform: `scale(${pop})` }}>
      {c.map((w, i) => {
        const next = c[i + 1];
        const active = ms >= w.startMs - 50 && (!next || ms < next.startMs - 50);
        return (
          <span key={i} style={{ fontSize: size, fontWeight: 900, letterSpacing: -1, color: active ? accent : text, whiteSpace: "nowrap",
            textShadow: "0 6px 30px rgba(0,0,0,0.75)" }}>
            {w.text.replace(/[.,:;]$/, "")}
          </span>
        );
      })}
    </div>
  );
};
