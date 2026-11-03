export type Visual = {
  headline?: string;
  number?: string;
  list?: string;
  code?: string;
  quote?: string;
  image?: string;
  video?: string;
};

export type SceneProps = { id: string; start: number; dur: number; visual: Visual };
export type Word = { text: string; startMs: number; endMs: number };

export type VideoProps = {
  title: string;
  accent: string;
  background: string;
  audio: string;
  durationInFrames: number;
  scenes: SceneProps[];
  captions: Word[];
};

export const FPS = 30;

// Shown in Remotion Studio when no props file is passed (run `python make.py <script> --studio` instead).
export const placeholder: VideoProps = {
  title: "script-to-video",
  accent: "#7cf5c8",
  background: "#0b1020",
  audio: "",
  durationInFrames: 150,
  scenes: [{ id: "hello", start: 0, dur: 5, visual: { headline: "Run *make.py* first" } }],
  captions: [],
};
