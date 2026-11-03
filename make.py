"""Script to video: one Markdown file in, a finished MP4 out.

    python make.py examples/how-it-works.md            # render
    python make.py examples/how-it-works.md --studio   # open Remotion Studio to tweak visuals

Steps: parse script -> Kokoro voice per scene -> Whisper word timing -> Remotion render -> loudness master.
Voice and timing are cached: if you only change visuals, the next run skips straight to rendering.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

from stv import align, master, script, voice

ROOT = Path(__file__).resolve().parent
FPS = 30
COMPOSITIONS = {"vertical": "Vertical", "landscape": "Landscape"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script", type=Path)
    ap.add_argument("--format", choices=["vertical", "landscape", "both"], help="overrides the script's format")
    ap.add_argument("--studio", action="store_true", help="open Remotion Studio instead of rendering")
    ap.add_argument("--remotion-args", default="", help="extra flags for `remotion render`, e.g. \"--concurrency=2\"")
    args = ap.parse_args()

    started = time.time()
    src = args.script.resolve()
    sc = script.parse(src)
    cfg = sc.settings
    name = src.stem
    build = ROOT / "public" / "build" / name
    build.mkdir(parents=True, exist_ok=True)
    print(f"{name}: {len(sc.scenes)} scenes")

    # 1-2. voice + word timing, cached by everything that changes the audio
    key = hashlib.sha1(json.dumps([[s.id, s.say] for s in sc.scenes] + [cfg["voice"], cfg["speed"], cfg["language"], cfg["pause"]]).encode()).hexdigest()
    cache = build / "audio.json"
    wav = build / "narration.wav"
    if cache.exists() and json.loads(cache.read_text()).get("key") == key and wav.exists():
        audio = json.loads(cache.read_text())
        print("  voice and timing unchanged, using cache")
    else:
        timing = voice.narrate(sc.scenes, cfg["voice"], float(cfg["speed"]), cfg["language"], float(cfg["pause"]), wav)
        captions = align.align(sc.scenes, timing, wav, cfg["language"])
        audio = {"key": key, "timing": timing, "captions": captions}
        cache.write_text(json.dumps(audio))

    # 3. copy images, clips and music next to the build so Remotion can load them
    def asset(rel: str) -> str:
        path = (src.parent / rel).resolve()
        if not path.exists():
            sys.exit(f"file not found: {rel} (paths are relative to {src.parent})")
        shutil.copy2(path, build / path.name)
        return f"build/{name}/{path.name}"

    scenes = []
    for s, t in zip(sc.scenes, audio["timing"]):
        visual = {k: v for k, v in s.visual.items() if k != "note"} or {"headline": s.id}
        for k in ("image", "video"):
            if k in visual:
                visual[k] = asset(visual[k])
        scenes.append({**t, "visual": visual})
    total = audio["timing"][-1]["start"] + audio["timing"][-1]["dur"]
    props = {
        "title": cfg["title"],
        "accent": cfg["accent"],
        "background": cfg["background"],
        "audio": f"build/{name}/narration.wav",
        "durationInFrames": round(total * FPS),
        "scenes": scenes,
        "captions": audio["captions"],
    }
    props_file = build / "props.json"
    props_file.write_text(json.dumps(props, indent=1))

    fmt = args.format or cfg["format"]
    formats = ["vertical", "landscape"] if fmt == "both" else [fmt]
    npx = shutil.which("npx") or sys.exit("npx not found: install Node.js 18+ and run `npm install`")
    if args.studio:
        subprocess.run([npx, "remotion", "studio", "src/index.ts", f"--props={props_file}"], cwd=ROOT)
        return

    # 4-5. render each format, then master the sound
    out_dir = ROOT / "out"
    out_dir.mkdir(exist_ok=True)
    music = (src.parent / cfg["music"]).resolve() if cfg["music"] else None
    for f in formats:
        raw = build / f"{f}.raw.mp4"
        cmd = [npx, "remotion", "render", "src/index.ts", COMPOSITIONS[f], str(raw), f"--props={props_file}",
               "--crf=18", *shlex.split(args.remotion_args)]
        print(f"  render {f}…")
        subprocess.run(cmd, cwd=ROOT, check=True)
        final = out_dir / f"{name}-{f}.mp4"
        master.master(raw, final, music, float(cfg["music_volume"]))
        print(f"done: {final.relative_to(ROOT)}  ({total:.1f} s video)")
    print(f"total time {time.time() - started:.0f} s")


if __name__ == "__main__":
    main()
