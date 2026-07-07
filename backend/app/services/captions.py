"""
captions.py — builds burned-in caption (.ass) files from caption timing data
produced by tts.py ({"text": ..., "start": sec, "end": sec} chunks).
"""

# Waree ships with fonts-thai-tlwg (installed in Dockerfile) and renders Thai glyphs correctly via libass
FONT_NAME = "Waree"

_ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{font},64,&H00FFFFFF,&H000000FF,&H00101010,&H00000000,-1,0,0,0,100,100,0,0,1,4,1,2,60,60,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _ts(seconds: float) -> str:
    """Seconds -> ASS timestamp H:MM:SS.CC"""
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", "\\N")


def build_ass_file(captions: list[dict], out_path: str) -> str | None:
    """Write an .ass subtitle file from caption chunks. Returns out_path, or None if no captions."""
    if not captions:
        return None
    lines = [_ASS_HEADER.format(font=FONT_NAME)]
    # Pop-in: each caption starts at 55% scale and snaps to 100% over its first 120ms —
    # a quick punch instead of just appearing flat, closer to typical short-form ad captions.
    pop_in = r"{\fscx55\fscy55\t(0,120,\fscx100\fscy100)}"
    for c in captions:
        start, end = float(c["start"]), float(c["end"])
        if end <= start:
            continue
        lines.append(
            f"Dialogue: 0,{_ts(start)},{_ts(end)},Caption,,0,0,0,,{pop_in}{_escape(c['text'])}"
        )
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return out_path


def subtitles_filter(ass_path: str) -> str:
    """FFmpeg -vf fragment to burn in the given .ass file. Path is escaped for the filter graph."""
    escaped = ass_path.replace("\\", "/").replace(":", "\\:")
    return f"subtitles='{escaped}'"
