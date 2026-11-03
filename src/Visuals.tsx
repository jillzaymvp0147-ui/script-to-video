// Scene visuals. Background: your image (slow zoom) or video clip. Foreground: headline, number, list, code or quote.
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, mono, useLayout } from "./Video";
import { FPS, Visual } from "./types";

export const Background: React.FC<{ visual: Visual; dur: number }> = ({ visual, dur }) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, dur * FPS], [1.04, 1.16], clamp);
  const cover: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` };
  return (
    <AbsoluteFill>
      {visual.video ? <OffthreadVideo src={staticFile(visual.video)} muted style={cover} /> : <Img src={staticFile(visual.image!)} style={cover} />}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #000a 0%, #0004 35%, #0004 60%, #000c 100%)" }} />
    </AbsoluteFill>
  );
};

export const Foreground: React.FC<{ visual: Visual; dur: number; overMedia: boolean }> = ({ visual, dur }) => {
  const { stage } = useLayout();
  const body = visual.number ? <NumberCard value={visual.number} />
    : visual.list ? <ListCard value={visual.list} dur={dur} />
    : visual.code ? <CodeCard value={visual.code} />
    : visual.quote ? <QuoteCard value={visual.quote} />
    : visual.headline ? <Headline value={visual.headline} />
    : null;
  if (!body) return null;
  return (
    <div style={{ position: "absolute", top: stage.top, height: stage.height, left: stage.side, right: stage.side,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
      {body}
      {visual.headline && (visual.number || visual.list || visual.code || visual.quote) ? <Kicker value={visual.headline} /> : null}
    </div>
  );
};

const useEnter = (delay: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.6 } });
};

// *word* in a headline is drawn in the accent colour; words pop in one after another.
const Headline: React.FC<{ value: string }> = ({ value }) => {
  const { tall, accent } = useLayout();
  const words = value.split(/\s+/);
  const len = value.replace(/\*/g, "").length;
  const size = (tall ? 1 : 1.15) * (len <= 10 ? 150 : len <= 22 ? 118 : len <= 40 ? 92 : 72);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.25}px`, textAlign: "center" }}>
      {words.map((w, i) => <PopWord key={i} word={w} i={i} size={size} accent={accent} />)}
    </div>
  );
};

const PopWord: React.FC<{ word: string; i: number; size: number; accent: string }> = ({ word, i, size, accent }) => {
  const p = useEnter(i * 3);
  const hot = /^\*.*\*[.,!?]?$/.test(word);
  return (
    <span style={{ fontSize: size, fontWeight: 900, lineHeight: 1.08, letterSpacing: -size * 0.03, color: hot ? accent : undefined,
      opacity: Math.min(p * 1.5, 1), transform: `translateY(${(1 - p) * size * 0.4}px) scale(${0.9 + p * 0.1})`, display: "inline-block" }}>
      {word.replace(/\*/g, "")}
    </span>
  );
};

const Kicker: React.FC<{ value: string }> = ({ value }) => {
  const { tall, muted } = useLayout();
  const p = useEnter(10);
  return (
    <div style={{ fontSize: tall ? 48 : 40, fontWeight: 700, color: muted, textAlign: "center", opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      {value.replace(/\*/g, "")}
    </div>
  );
};

// "$0", "1,594", "100 → 0" (counts from 100 down to 0); text after "|" is the label.
const NumberCard: React.FC<{ value: string }> = ({ value }) => {
  const frame = useCurrentFrame();
  const { tall, accent, muted } = useLayout();
  const [main, label] = value.split("|").map((s) => s.trim());
  const [a, b] = main.includes("→") ? main.split("→").map((s) => s.trim()) : [null, main];
  const num = (s: string) => parseFloat((s.match(/-?[\d,]*\.?\d+/)?.[0] ?? "0").replace(/,/g, ""));
  const target = b!;
  const m = target.match(/-?[\d,]*\.?\d+/);
  const decimals = m && m[0].includes(".") ? m[0].split(".")[1].length : 0;
  const from = a !== null ? num(a) : 0;
  const to = num(target);
  const k = interpolate(frame, [4, 4 + FPS * 1.2], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  const v = from + (to - from) * k;
  const shown = m
    ? target.replace(m[0], v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: m[0].includes(",") || Math.abs(to) >= 10000 }))
    : target;
  const len = shown.length;
  const size = (tall ? 1 : 1.1) * (len <= 4 ? 300 : len <= 7 ? 220 : 150);
  const p = useEnter(0);
  return (
    <>
      <div style={{ fontSize: size, fontWeight: 900, letterSpacing: -size * 0.04, color: accent, lineHeight: 1, transform: `scale(${0.8 + p * 0.2})`,
        fontVariantNumeric: "tabular-nums", textShadow: `0 0 80px ${accent}55` }}>
        {shown}
      </div>
      {label ? <div style={{ fontSize: tall ? 52 : 44, fontWeight: 700, color: muted, textAlign: "center", opacity: p }}>{label}</div> : null}
    </>
  );
};

// Items separated by "|" appear one by one across the first 75% of the scene; the newest one is highlighted.
const ListCard: React.FC<{ value: string; dur: number }> = ({ value, dur }) => {
  const frame = useCurrentFrame();
  const { tall, accent, text, muted } = useLayout();
  const items = value.split("|").map((s) => s.trim()).filter(Boolean);
  const step = (dur * FPS * 0.75) / items.length;
  const size = tall ? 68 : 52;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tall ? 26 : 18, width: tall ? "100%" : 1100 }}>
      {items.map((item, i) => {
        const at = i * step;
        const p = spring({ frame: frame - at, fps: FPS, config: { damping: 15, mass: 0.6 } });
        const newest = frame >= at && (i === items.length - 1 || frame < (i + 1) * step);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 28, padding: tall ? "26px 34px" : "18px 30px", borderRadius: 28,
            background: newest ? `${accent}1f` : "#ffffff0d", border: `2px solid ${newest ? accent : "#ffffff14"}`,
            opacity: Math.min(p * 1.5, 1), transform: `translateX(${(1 - p) * -80}px)` }}>
            <div style={{ width: size, height: size, flex: "none", borderRadius: "50%", background: p > 0.5 ? accent : "transparent",
              border: `3px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#0b1020" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <span style={{ fontSize: size, fontWeight: 800, color: newest ? text : muted }}>{item}</span>
          </div>
        );
      })}
    </div>
  );
};

// A terminal: the first line is typed after "$", the rest appear as output once typing ends. Lines are split by "|".
const CodeCard: React.FC<{ value: string }> = ({ value }) => {
  const frame = useCurrentFrame();
  const { tall, accent, text, muted } = useLayout();
  const [cmd, ...output] = value.split("|").map((s) => s.trim());
  const typeStart = 6;
  const cps = 2.2; // characters per frame (~66/s)
  const typed = Math.max(0, Math.min(cmd.length, Math.floor((frame - typeStart) * cps)));
  const done = typeStart + cmd.length / cps;
  // shrink the font so the longest line fits the card without breaking mid-word
  const inner = tall ? 920 - 80 : 1200 - 88;
  const longest = Math.max(cmd.length + 2, ...output.map((l) => l.length));
  const size = Math.max(26, Math.min(tall ? 46 : 40, inner / (longest * 0.64)));
  const p = useEnter(0);
  const cursorOn = Math.floor(frame / 15) % 2 === 0 || typed < cmd.length;
  return (
    <div style={{ width: tall ? "100%" : 1200, borderRadius: 28, overflow: "hidden", background: "#070a14", border: "2px solid #ffffff1a",
      boxShadow: `0 40px 120px #0009, 0 0 0 1px ${accent}22`, transform: `scale(${0.92 + p * 0.08})`, opacity: p }}>
      <div style={{ display: "flex", gap: 14, padding: "22px 28px", background: "#ffffff0a" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 22, height: 22, borderRadius: "50%", background: c }} />)}
      </div>
      <div style={{ padding: tall ? "40px 40px 50px" : "36px 44px 44px", fontFamily: mono, fontSize: size, lineHeight: 1.6 }}>
        <div style={{ wordBreak: "break-all" }}>
          <span style={{ color: accent }}>$ </span>
          <span style={{ color: text }}>{cmd.slice(0, typed)}</span>
          {typed < cmd.length || output.length === 0 ? <span style={{ opacity: cursorOn ? 1 : 0, color: accent }}>▌</span> : null}
        </div>
        {output.map((line, i) => {
          const at = done + 8 + i * 9;
          const o = interpolate(frame, [at, at + 5], [0, 1], clamp);
          const ok = line.startsWith("✓");
          return <div key={i} style={{ opacity: o, color: ok ? accent : muted, wordBreak: "break-all" }}>{line}</div>;
        })}
      </div>
    </div>
  );
};

// "Text — Author"
const QuoteCard: React.FC<{ value: string }> = ({ value }) => {
  const { tall, accent, muted } = useLayout();
  const [quote, author] = value.split(" — ");
  const p = useEnter(0);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)`, textAlign: "center" }}>
      <div style={{ fontSize: tall ? 220 : 180, lineHeight: 0.6, color: accent, fontWeight: 900 }}>“</div>
      <div style={{ fontSize: tall ? 72 : 64, fontWeight: 800, lineHeight: 1.2, marginTop: 20 }}>{quote}</div>
      {author ? <div style={{ fontSize: tall ? 44 : 38, color: muted, marginTop: 30, fontWeight: 600 }}>— {author}</div> : null}
    </div>
  );
};
