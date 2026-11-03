"""Final mix: optional music under the voice, loudness to -14 LUFS (YouTube's target), H.264 yuv420p."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11"


def master(video: Path, out: Path, music: Path | None = None, music_db: float = -20.0) -> None:
    inputs = ["-i", str(video)]
    if music:
        inputs += ["-stream_loop", "-1", "-i", str(music)]
        mix = (f"[1:a]volume={music_db}dB,afade=t=in:d=1[m];"
               f"[0:a][m]amix=inputs=2:duration=first:normalize=0[a]")
    else:
        mix = "[0:a]anull[a]"

    # pass 1: measure
    r = subprocess.run(["ffmpeg", "-hide_banner", *inputs, "-filter_complex", f"{mix};[a]{LOUDNORM}:print_format=json[o]",
                        "-map", "[o]", "-f", "null", "-"], capture_output=True, text=True)
    m = json.loads(re.findall(r"\{[^{}]+\}", r.stderr)[-1])
    norm = (f"{LOUDNORM}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
            f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    # pass 2: apply, fade the end, re-encode for every player
    # only ffmpeg is required: read duration and pixel format from its own report
    info = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(video)], capture_output=True, text=True).stderr
    h, mnt, sec = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info).groups()
    dur = int(h) * 3600 + int(mnt) * 60 + float(sec)
    fade = f"afade=t=out:st={max(dur - 0.8, 0):.2f}:d=0.8"
    # Remotion's JPEG frames come out as full-range yuvj420p; convert to the TV range players expect
    vf = "scale=in_range=pc:out_range=tv,format=yuv420p" if "yuvj" in info else "format=yuv420p"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs,
                    "-filter_complex", f"{mix};[a]{norm},{fade}[o]", "-map", "0:v", "-map", "[o]", "-vf", vf,
                    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-color_range", "tv",
                    "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)], check=True)
    print(f"  master {out.name}: {m['input_i']} LUFS -> -14 LUFS")
