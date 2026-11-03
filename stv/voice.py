"""Read every scene aloud with Kokoro (runs locally, no API key) and glue the scenes into one track."""
from __future__ import annotations

import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

MODELS = Path(__file__).resolve().parent.parent / "models"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = ["kokoro-v1.0.onnx", "voices-v1.0.bin"]


def ensure_models() -> None:
    MODELS.mkdir(exist_ok=True)
    for name in FILES:
        target = MODELS / name
        if not target.exists():
            print(f"downloading {name} (one time, ~330 MB in total)…")
            tmp = target.with_suffix(".part")
            urllib.request.urlretrieve(RELEASE + name, tmp)
            tmp.rename(target)


def narrate(scenes, voice: str, speed: float, language: str, pause: float, out_wav: Path) -> list[dict]:
    """Return scene timing: [{id, start, dur}] in seconds; dur includes the pause after the scene."""
    from kokoro_onnx import Kokoro

    ensure_models()
    kokoro = Kokoro(str(MODELS / FILES[0]), str(MODELS / FILES[1]))
    chunks, timing, t, rate = [], [], 0.0, 24000
    for i, scene in enumerate(scenes):
        samples, rate = kokoro.create(scene.say, voice=voice, speed=speed, lang=language)
        gap = pause * (2 if i == len(scenes) - 1 else 1)
        chunks += [samples, np.zeros(int(rate * gap), dtype=samples.dtype)]
        dur = len(samples) / rate + gap
        timing.append({"id": scene.id, "start": round(t, 3), "dur": round(dur, 3)})
        t += dur
        print(f"  voice  {scene.id:<12} {dur:5.1f} s")
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_wav, np.concatenate(chunks), rate)
    return timing
