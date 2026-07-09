"""
captions.py — builds burned-in caption (.ass) files from caption timing data
produced by tts.py ({"text": ..., "start": sec, "end": sec, "words": [...]} chunks).
"""

# Waree ships with fonts-thai-tlwg (installed in Dockerfile) and renders Thai glyphs correctly via libass
FONT_NAME = "Waree"

# Confirmed by direct render test: ASS \k karaoke shows PrimaryColour for the current +
# already-reached words and SecondaryColour for words not reached yet — the switch happens
# the instant a word's own \k segment starts (not a gradual sweep), so "primary" = highlight
# color and "secondary" = the not-yet-spoken color, not the other way around.
CAPTION_STYLES = {
    # Default — words turn gold as they're spoken, OpusClip/CapCut-style highlight.
    "karaoke": {
        "primary": "&H0000D7FF",   # gold (spoken)
        "secondary": "&H00FFFFFF",  # white (not yet spoken)
        "outline": "&H00101010",
        "back": "&H00000000",
        "border_style": 1,
        "use_karaoke": True,
    },
    # Plain white text, no per-word highlight — the original look, for anyone who finds the
    # color change distracting.
    "classic": {
        "primary": "&H00FFFFFF",
        "secondary": "&H00FFFFFF",
        "outline": "&H00101010",
        "back": "&H00000000",
        "border_style": 1,
        "use_karaoke": False,
    },
    # Opaque pill-style background box behind the text, spoken words highlighted gold.
    "boxed": {
        "primary": "&H00FFFFFF",
        "secondary": "&H0000D7FF",
        "outline": "&H00000000",
        "back": "&H90101010",
        "border_style": 3,
        "use_karaoke": True,
    },
    # Thin, semi-transparent white — no bold, minimal outline, just a soft shadow. Modeled on
    # a reference clip the user pointed to (light caption text, low-opacity, no per-word
    # highlight) — calmer/more premium-looking than the bold gold karaoke default.
    "elegant": {
        "primary": "&H20FFFFFF",   # white at ~87% opacity (ASS alpha is inverted: 00=opaque, FF=transparent)
        "secondary": "&H20FFFFFF",
        "outline": "&H00000000",
        "back": "&H00000000",
        "border_style": 1,
        "use_karaoke": False,
        "bold": False,
        "fontsize": 50,
        "outline_width": 1,
    },
}
DEFAULT_CAPTION_STYLE = "karaoke"

_STYLE_DEFAULTS = {"bold": True, "fontsize": 64, "outline_width": 4}

_ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{font},{fontsize},{primary},{secondary},{outline},{back},{bold_flag},0,0,0,100,100,0,0,{border_style},{outline_width},1,2,60,60,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

# Rotating pool of entrance animations for caption groups — cycling through these instead of
# always the same pop-in reads as more alive/varied rather than monotonous, without needing a
# user-facing picker (auto-rotated the same way the "auto" video style is AI-picked, not manual).
# Coordinates target this composition's actual anchor: PlayResX=1080 (center x=540),
# Alignment=2 (bottom-center) with MarginV=140 (anchor y≈1780) — \move overrides the style's
# default auto-position, so it has to land on the same spot or the line visibly jumps.
_ANCHOR_X, _ANCHOR_Y = 540, 1780
_ENTRANCE_ANIMATIONS = [
    # Quick punch-in: starts small, snaps to full size over 120ms.
    r"{\fscx55\fscy55\t(0,120,\fscx100\fscy100)}",
    # Fade + rise: starts transparent and 20px lower, eases up into place over 220ms.
    rf"{{\alpha&HFF&\move({_ANCHOR_X},{_ANCHOR_Y + 20},{_ANCHOR_X},{_ANCHOR_Y},0,220)\t(0,220,\alpha&H00&)}}",
    # Soft fade only — no movement/scale, just an opacity ease-in over 250ms.
    r"{\alpha&HFF&\t(0,250,\alpha&H00&)}",
    # Slide down + fade: starts 16px higher, settles down over 200ms.
    rf"{{\alpha&HFF&\move({_ANCHOR_X},{_ANCHOR_Y - 16},{_ANCHOR_X},{_ANCHOR_Y},0,200)\t(0,200,\alpha&H00&)}}",
]


def _ts(seconds: float) -> str:
    """Seconds -> ASS timestamp H:MM:SS.CC"""
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", "\\N")


def _karaoke_text(words: list[dict], group_start: float, group_end: float, is_thai: bool) -> str:
    """Build \\k-tagged ASS text so each word switches from secondary -> primary color at the
    instant it's spoken, instead of the whole caption group lighting up at once."""
    parts = []
    n = len(words)
    for i, w in enumerate(words):
        start = max(w["start"], group_start)
        next_start = words[i + 1]["start"] if i + 1 < n else group_end
        dur = max(next_start - start, 0.0)
        centis = max(1, round(dur * 100))
        text = _escape(w["text"])
        if not is_thai and i < n - 1:
            text += " "
        parts.append(f"{{\\k{centis}}}{text}")
    return "".join(parts)


def build_ass_file(captions: list[dict], out_path: str, caption_style: str = DEFAULT_CAPTION_STYLE) -> str | None:
    """Write an .ass subtitle file from caption chunks. Returns out_path, or None if no captions."""
    if not captions:
        return None
    preset = {**_STYLE_DEFAULTS, **CAPTION_STYLES.get(caption_style, CAPTION_STYLES[DEFAULT_CAPTION_STYLE])}
    header_fields = {**preset, "bold_flag": "-1" if preset["bold"] else "0"}
    lines = [_ASS_HEADER.format(font=FONT_NAME, **header_fields)]
    for i, c in enumerate(captions):
        start, end = float(c["start"]), float(c["end"])
        if end <= start:
            continue
        words = c.get("words") or []
        if preset["use_karaoke"] and words:
            is_thai = any("฀" <= ch <= "๿" for ch in c["text"])
            body = _karaoke_text(words, start, end, is_thai)
        else:
            body = _escape(c["text"])
        entrance = _ENTRANCE_ANIMATIONS[i % len(_ENTRANCE_ANIMATIONS)]
        lines.append(f"Dialogue: 0,{_ts(start)},{_ts(end)},Caption,,0,0,0,,{entrance}{body}")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return out_path


def subtitles_filter(ass_path: str) -> str:
    """FFmpeg -vf fragment to burn in the given .ass file. Path is escaped for the filter graph."""
    escaped = ass_path.replace("\\", "/").replace(":", "\\:")
    return f"subtitles='{escaped}'"
