"""Parse a Markdown script into settings and scenes.

Format:

    ---
    voice: am_michael
    format: vertical
    ---

    ## hook
    > headline: One text file
    This whole video started as a plain text file.

Front matter holds `key: value` settings. Every `## name` starts a scene.
Lines starting with `>` set the scene's visual (`> kind: value`); all other
lines are the narration that the voice reads out.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

VISUALS = {"headline", "number", "list", "code", "image", "video", "quote"}

DEFAULTS = {
    "title": "",
    "voice": "am_michael",
    "speed": "1.0",
    "language": "en-us",
    "format": "vertical",  # vertical | landscape | both
    "accent": "#7cf5c8",
    "background": "#0b1020",
    "music": "",
    "music_volume": "-20",  # dB under the voice
    "pause": "0.35",  # seconds of silence after each scene
}


@dataclass
class Scene:
    id: str
    say: str
    visual: dict[str, str] = field(default_factory=dict)


@dataclass
class Script:
    settings: dict[str, str]
    scenes: list[Scene]


def parse(path: Path) -> Script:
    text = path.read_text(encoding="utf-8")
    settings = dict(DEFAULTS)
    m = re.match(r"\s*---\n(.*?)\n---\n", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line and not line.lstrip().startswith("#"):
                key, value = line.split(":", 1)
                settings[key.strip()] = value.split(" #")[0].strip().strip('"')
        text = text[m.end():]

    scenes: list[Scene] = []
    for block in re.split(r"^##\s+", text, flags=re.M)[1:]:
        head, *lines = block.splitlines()
        visual: dict[str, str] = {}
        say: list[str] = []
        for line in lines:
            s = line.strip()
            if s.startswith(">"):
                key, _, value = s[1:].partition(":")
                key = key.strip().lower()
                if key not in VISUALS and key != "note":
                    raise ValueError(f"scene '{head.strip()}': unknown visual '{key}' (use one of {sorted(VISUALS)})")
                visual[key] = value.strip()
            elif s:
                say.append(s)
        if not say:
            raise ValueError(f"scene '{head.strip()}' has no narration")
        scenes.append(Scene(id=head.strip(), say=" ".join(say), visual=visual))
    if not scenes:
        raise ValueError(f"{path}: no scenes found (each scene starts with '## name')")
    return Script(settings, scenes)
