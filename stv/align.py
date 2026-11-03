"""Word-level captions: the words come from the script, the timing comes from Whisper.

Whisper transcribes each scene on its own. Words it heard the same way get its
timestamps; words it wrote differently (numbers, names) are spread over the gap
between their neighbours by length. So captions always match the script text.
"""
from __future__ import annotations

import difflib
import os
import re
import subprocess
import tempfile
from pathlib import Path

import soundfile as sf


def _norm(word: str) -> str:
    return re.sub(r"[^\w]", "", word.lower())


def align(scenes, timing: list[dict], wav: Path, language: str) -> list[dict]:
    from faster_whisper import WhisperModel

    lang = language.split("-")[0]
    model_name = "small.en" if lang == "en" else "small"
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    out: list[dict] = []
    for scene, t in zip(scenes, timing):
        with tempfile.NamedTemporaryFile(suffix=".wav") as f:
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(t["start"]), "-t", str(t["dur"]),
                            "-i", str(wav), "-ar", "16000", "-ac", "1", f.name], check=True)
            # pass samples, not a path: decoding a file needs PyAV, whose versions break faster-whisper
            samples, _ = sf.read(f.name, dtype="float32")
            segments, _ = model.transcribe(samples, language=lang, word_timestamps=True)
            heard = [w for s in segments for w in s.words]

        words = scene.say.split()
        times: list[tuple[float, float] | None] = [None] * len(words)
        matcher = difflib.SequenceMatcher(a=[_norm(w) for w in words], b=[_norm(w.word) for w in heard], autojunk=False)
        matched = 0
        for block in matcher.get_matching_blocks():
            for k in range(block.size):
                h = heard[block.b + k]
                times[block.a + k] = (h.start, h.end)
            matched += block.size

        speech_start = heard[0].start if heard else 0.0
        speech_end = heard[-1].end if heard else max(t["dur"] - 0.3, 0.1)
        i = 0
        while i < len(words):
            if times[i]:
                i += 1
                continue
            j = i
            while j < len(words) and not times[j]:
                j += 1
            a = times[i - 1][1] if i > 0 else speech_start
            b = times[j][0] if j < len(words) else speech_end
            total = sum(len(w) for w in words[i:j]) or 1
            x = a
            for k in range(i, j):
                d = (b - a) * len(words[k]) / total
                times[k] = (x, x + d)
                x += d
            i = j

        for w, (a, b) in zip(words, times):
            out.append({"text": w, "startMs": round((t["start"] + a) * 1000), "endMs": round((t["start"] + b) * 1000)})
        print(f"  timing {scene.id:<12} {matched}/{len(words)} words heard")
    return out
