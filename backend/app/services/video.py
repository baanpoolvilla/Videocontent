import asyncio
import json
import logging
import os
import re
import tempfile
import httpx
from PIL import Image
from app.services.captions import build_ass_file, subtitles_filter
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

# Output size
OUT_W, OUT_H = 1080, 1920
# Pre-scale size (30% larger for Ken Burns headroom)
PRE_W, PRE_H = int(OUT_W * 1.3), int(OUT_H * 1.3)   # 1404 x 2496

# Crossfade settings for AI clips
FADE_DUR = 1.5          # seconds — max crossfade between clips
FADE_TRANSITION = "fade"   # xfade transition: fade = smooth linear crossfade, no black flash
# NOTE: do not use "dissolve" here — despite the name it's a stochastic per-pixel dither
# transition, not a plain crossfade, and looks like heavy noise/ghosting on detailed footage.
FADE_ENDS = 0.5         # seconds — fade-in at start and fade-out at end

# Cinematic color grade applied to every clip before compositing (CapCut/Runway approach)
# Warm shadows, lifted highlights, slight contrast boost, subtle vignette
_COLOR_GRADE = (
    "eq=saturation=1.12:contrast=1.06:brightness=0.02,"
    "colorbalance=rs=0.04:bs=-0.03:rh=0.07:bh=-0.05,"
    "vignette=angle=PI/5:mode=forward"
)

# Darker, desaturated, higher-contrast grade for the "editorial" style (real-estate/luxury look)
_MOODY_GRADE = (
    "colorbalance=rs=-0.03:rm=-0.02:rh=0:gs=-0.02:gm=-0.01:gh=0:bs=0.02:bm=0.02:bh=0,"
    "eq=saturation=0.80:contrast=1.28:brightness=-0.04,"
    "vignette=PI/3.5"
)

# Bright, warm, airy grade for the "prime" style — sunlit real-estate look (competitor's
# "Prime Location" template), the opposite direction from the dark/moody editorial grade.
_PRIME_GRADE = (
    "colorbalance=rs=0.06:rm=0.05:rh=0.03:gs=0.02:gm=0.02:gh=0.01:bs=-0.05:bm=-0.04:bh=-0.02,"
    "eq=saturation=1.08:contrast=1.05:brightness=0.06,"
    "vignette=PI/6"
)

# Deep blacks, crushed shadows, cool desaturated tone — "Midnight Luxe" (modeled on a
# competitor reference: dark beauty/luxury campaign look, spotlight-on-subject feel).
# Darker and cooler than "editorial", which is moody but still mid-toned.
_MIDNIGHT_GRADE = (
    "colorbalance=rs=-0.06:rm=-0.04:rh=-0.02:gs=-0.02:gm=-0.01:gh=0:bs=0.05:bm=0.04:bh=0.02,"
    "eq=saturation=0.65:contrast=1.38:brightness=-0.09:gamma=0.92,"
    "vignette=PI/2.8"
)

# Punchy, boosted-saturation grade for "tv_shopping" — modeled on a competitor reference
# (hot-pink shopping-channel aesthetic: loud, high-energy, everything turned up).
_TV_SHOPPING_GRADE = (
    "colorbalance=rs=0.10:rm=0.08:rh=0.03:gs=-0.02:gm=-0.02:gh=0:bs=-0.02:bm=0:bh=0.02,"
    "eq=saturation=1.55:contrast=1.18:brightness=0.04,"
    "vignette=PI/6"
)

_GRADES = {
    "warm": _COLOR_GRADE, "editorial": _MOODY_GRADE, "prime": _PRIME_GRADE,
    "midnight": _MIDNIGHT_GRADE, "tv_shopping": _TV_SHOPPING_GRADE,
}

# Merged Thai+Latin serif face for the "editorial" style headline — must be a plain .ttf/.otf,
# not .woff2 (FFmpeg drawtext segfaults on woff2 with this build; subtitles/libass is fine with it)
_SERIF_FONT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "fonts", "NotoSerifThai-Merged.ttf")

# HyperFrames (github.com/heygen-com/hyperframes) — renders the "prime" style's title card
# via headless Chrome + GSAP for real spring/ease animation, instead of the linear-fade
# drawtext used by the other styles. Pinned as a local dependency in the Docker image (see
# Dockerfile) rather than invoked via npx, so renders don't hit the npm registry.
_HYPERFRAMES_BIN = "/opt/hyperframes-runtime/node_modules/.bin/hyperframes"
_HYPERFRAMES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "hyperframes")

# One HyperFrames composition per title-card style — real CSS (rounded corners, box-shadow,
# spring/ease entrance motion via GSAP) instead of FFmpeg drawtext/drawbox, which can't do
# any of that (confirmed live: the tv_shopping drawbox pill read as a flat, sharp-cornered
# rectangle with no depth — "title ไม่สวยเลย"). Falls back to the plain drawtext overlay for
# any style not in this dict, or if the render itself fails.
_TITLE_COMPOSITION_DIRS = {
    "prime": os.path.join(_HYPERFRAMES_DIR, "prime_location"),
    "midnight": os.path.join(_HYPERFRAMES_DIR, "midnight_title"),
    "tv_shopping": os.path.join(_HYPERFRAMES_DIR, "tv_shopping_title"),
}


_SCRIPT_BOUNDARY_RE = re.compile(r'(?<=[ก-๙])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[ก-๙])')


def _escape_drawtext(text: str) -> str:
    # Display-only fix: insert a space wherever Thai script touches Latin/digits with none —
    # a product name typed/generated without one (e.g. "Sicilyพูลวิลล่า") reads as visibly
    # squished on a title card even though it's fine as spoken TTS input (this function is
    # only ever used for on-screen drawtext, never for narration text).
    text = _SCRIPT_BOUNDARY_RE.sub(" ", text)
    return (
        text.replace("\\", "\\\\").replace("'", "’")
        .replace(":", "\\:").replace("%", "\\%")
    )


def _short_headline(text: str, max_chars: int = 22) -> str:
    """Both title-card renderers (HyperFrames' fixed-width box and the FFmpeg drawtext
    overlay, which has no width bound at all) were designed for a short 1-4 word title —
    the HyperFrames composition's own placeholder default is a single word ("พูลวิลลา").
    The AI-written "hook" is a full spoken sentence meant for narration, not a title, so
    passing it straight through overflowed the frame. Cut it down to something title-sized,
    breaking on a space if one exists near the limit so we don't chop a word in half."""
    text = text.strip()
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    last_space = cut.rfind(" ")
    if last_space > max_chars * 0.5:
        cut = cut[:last_space]
    return cut.rstrip(" ,.!?") + "…"


def _dedupe_subtitle(headline: str, subtitle: str) -> str:
    """The title card draws subtitle as a second line under headline — but the AI-written
    title_card often just IS the product name, so subtitle (always the raw product name)
    ends up repeating the headline verbatim (confirmed live: "SICILY POOLVILLA" directly
    above "Sicily Poolvilla" — same text, different case). Drop the subtitle line entirely
    when it's redundant instead of showing the same phrase twice."""
    norm = lambda s: re.sub(r"[^\w]+", "", s).lower()
    h, s = norm(headline), norm(subtitle)
    if not s or not h:
        return subtitle
    if s == h or s in h or h in s:
        return ""
    return subtitle


def _editorial_headline_overlay(headline: str, subtitle: str, hold: float = 3.0, fade_out: float = 0.5) -> str:
    """Bottom-left serif title card (headline + subtitle + thin accent line): fades in over
    0.6s, holds for `hold` seconds, then fades back out — it was previously left with no end
    at all, so it sat on screen for the entire clip instead of just the opening (confirmed via
    the equivalent HyperFrames overlay bug: FFmpeg's default overlay/no-enable behavior doesn't
    remove itself on its own)."""
    end = hold + fade_out
    alpha = f"if(lt(t,0.6),t/0.6,if(lt(t,{hold}),1,if(lt(t,{end}),1-(t-{hold})/{fade_out},0)))"
    h = _escape_drawtext(headline)
    parts = [f"drawbox=x=80:y=h-500:w=70:h=3:color=white@0.9:t=fill:enable='lt(t,{end})'"]
    parts.append(
        f"drawtext=fontfile='{_SERIF_FONT}':text='{h}':fontsize=58:fontcolor=white:"
        f"x=80:y=h-470:alpha='{alpha}'"
    )
    if subtitle.strip():
        s = _escape_drawtext(subtitle)
        parts.append(
            f"drawtext=fontfile='{_SERIF_FONT}':text='{s}':fontsize=30:fontcolor=white@0.8:"
            f"x=80:y=h-400:alpha='{alpha}'"
        )
    return ",".join(parts)


def _midnight_headline_overlay(headline: str, subtitle: str, hold: float = 3.0, fade_out: float = 0.5) -> str:
    """Centered, champagne-gold title card for "midnight" — modeled on a competitor reference
    (dark beauty/luxury campaign: centered thin headline, muted subtitle below, no accent bar).
    Same fade-in/hold/fade-out timing as the editorial card, different position and palette."""
    end = hold + fade_out
    alpha = f"if(lt(t,0.6),t/0.6,if(lt(t,{hold}),1,if(lt(t,{end}),1-(t-{hold})/{fade_out},0)))"
    h = _escape_drawtext(headline)
    parts = [
        f"drawtext=fontfile='{_SERIF_FONT}':text='{h}':fontsize=60:fontcolor=0xE8C97E:"
        f"x=(w-text_w)/2:y=h*0.62:alpha='{alpha}'"
    ]
    if subtitle.strip():
        s = _escape_drawtext(subtitle)
        parts.append(
            f"drawtext=fontfile='{_SERIF_FONT}':text='{s}':fontsize=28:fontcolor=white@0.75:"
            f"x=(w-text_w)/2:y=h*0.62+70:alpha='{alpha}'"
        )
    return ",".join(parts)


def _tv_shopping_headline_overlay(headline: str, subtitle: str, hold: float = 3.0, fade_out: float = 0.5) -> str:
    """Hot-pink background pill behind bold white headline for "tv_shopping" (same font
    asset as the other drawtext styles since no bold sans-serif font file is bundled)."""
    end = hold + fade_out
    alpha = f"if(lt(t,0.6),t/0.6,if(lt(t,{hold}),1,if(lt(t,{end}),1-(t-{hold})/{fade_out},0)))"
    h = _escape_drawtext(headline)
    # drawbox can't reference the following drawtext's text_w, so size the pill from headline
    # character count directly instead (rough estimate is fine for a background pill).
    box_w = 80 + max(len(h) * 34, 200)
    parts = [
        f"drawbox=x=(iw-{box_w})/2:y=(ih*0.6)-20:w={box_w}:h=100:color=0xFF1F8F@1.0:t=fill:"
        f"enable='between(t,0,{end})'",
        f"drawtext=fontfile='{_SERIF_FONT}':text='{h}':fontsize=54:fontcolor=white:"
        f"x=(w-text_w)/2:y=h*0.6:alpha='{alpha}'",
    ]
    if subtitle.strip():
        s = _escape_drawtext(subtitle)
        parts.append(
            f"drawtext=fontfile='{_SERIF_FONT}':text='{s}':fontsize=28:fontcolor=white@0.85:"
            f"x=(w-text_w)/2:y=h*0.6+90:alpha='{alpha}'"
        )
    return ",".join(parts)

# Scale+crop any image to PRE_W x PRE_H preserving aspect ratio, then Ken Burns
_SCALE_CROP = (
    f"scale={PRE_W}:{PRE_H}:force_original_aspect_ratio=increase,"
    f"crop={PRE_W}:{PRE_H}:(iw-{PRE_W})/2:(ih-{PRE_H})/2"
)

def _kb_zoom_in(d: int, grade: str = "warm") -> str:
    """Zoom in: wide → close-up"""
    return (
        f"{_SCALE_CROP},"
        f"zoompan=z='min(1+0.3*on/{d},1.3)':"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d={d}:s={OUT_W}x{OUT_H}:fps=25,"
        f"{_GRADES.get(grade, _COLOR_GRADE)}"
    )

def _kb_zoom_out(d: int, grade: str = "warm") -> str:
    """Zoom out: close-up → wide"""
    return (
        f"{_SCALE_CROP},"
        f"zoompan=z='max(1.3-0.3*on/{d},1.0)':"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d={d}:s={OUT_W}x{OUT_H}:fps=25,"
        f"{_GRADES.get(grade, _COLOR_GRADE)}"
    )

def _kb_pan_left(d: int, grade: str = "warm") -> str:
    """Pan: left edge → right edge at fixed zoom 1.2"""
    z = 1.2
    max_x = int(PRE_W - PRE_W / z)
    return (
        f"{_SCALE_CROP},"
        f"zoompan=z={z}:"
        f"x='min(on*{max_x}/{d},{max_x})':"
        f"y='ih/2-(ih/{z}/2)':"
        f"d={d}:s={OUT_W}x{OUT_H}:fps=25,"
        f"{_GRADES.get(grade, _COLOR_GRADE)}"
    )

def _kb_pan_right(d: int, grade: str = "warm") -> str:
    """Pan: right edge → left edge at fixed zoom 1.2"""
    z = 1.2
    max_x = int(PRE_W - PRE_W / z)
    return (
        f"{_SCALE_CROP},"
        f"zoompan=z={z}:"
        f"x='max({max_x}-on*{max_x}/{d},0)':"
        f"y='ih/2-(ih/{z}/2)':"
        f"d={d}:s={OUT_W}x{OUT_H}:fps=25,"
        f"{_GRADES.get(grade, _COLOR_GRADE)}"
    )


_VIDEO_EXTS = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"}


def _is_video_file(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in _VIDEO_EXTS


def _video_segment_filter(grade: str = "warm") -> str:
    """Cover-crop + color grade for an already-moving video clip — no Ken Burns zoompan needed."""
    return (
        f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,"
        f"crop={OUT_W}:{OUT_H},"
        f"{_GRADES.get(grade, _COLOR_GRADE)}"
    )


class VideoService:
    async def compose_from_clips(
        self,
        job_id: str,
        clip_urls: list[str],
        voiceover_url: str,
        duration_sec: int = 30,
        logo_url: str = "",
        labels: list[str] = [],
        captions: list[dict] | None = None,
    ) -> dict:
        """Compose AI-generated clips into final video with crossfade transitions and optional text labels."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 1. Download all clips
            clip_paths = []
            for i, url in enumerate(clip_urls):
                p = os.path.join(tmpdir, f"clip_{i}.mp4")
                await self._download_file(url, p)
                clip_paths.append(p)

            # 2. Normalize: same resolution, fps, codec — strip audio (voiceover added later)
            # If label is set for this clip, burn it in as a fade-in/fade-out text overlay (first 3s only)
            norm_paths = []
            for i, cp in enumerate(clip_paths):
                np_ = os.path.join(tmpdir, f"norm_{i}.mp4")
                label = labels[i].strip() if i < len(labels) else ""
                # Sanitize: remove ffmpeg filter special chars
                safe_label = label.replace("'", "").replace("\\", "").replace(":", " ").replace("[", "").replace("]", "").replace(";", "")[:35]

                # Scale + crop + cinematic color grade + vignette (applied consistently to every clip)
                base_vf = (
                    f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,"
                    f"crop={OUT_W}:{OUT_H},"
                    f"{_COLOR_GRADE}"
                )
                if safe_label:
                    # Text fades in 0→0.5s, stays until 2.5s, fades out 2.5→3.0s
                    alpha_expr = "if(lt(t,0.5),(t/0.5),if(lt(t,2.5),1,if(lt(t,3.0),((3.0-t)/0.5),0)))"
                    vf = (
                        f"{base_vf},"
                        f"drawtext=text='{safe_label}'"
                        f":fontsize=52:fontcolor=white"
                        f":x=(w-text_w)/2:y=h*0.82"
                        f":alpha='{alpha_expr}'"
                        f":box=1:boxcolor=black@0.45:boxborderw=14"
                        f":shadowcolor=black@0.7:shadowx=2:shadowy=2"
                    )
                else:
                    vf = base_vf

                await self._run_ffmpeg([
                    "ffmpeg", "-y", "-i", cp,
                    "-vf", vf,
                    "-r", "30",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                    "-pix_fmt", "yuv420p", "-an",
                    np_,
                ])
                norm_paths.append(np_)
                logger.info(f"[VIDEO] normalized clip {i} label={repr(safe_label)}")

            # 3. Merge with crossfade dissolve between clips
            if len(norm_paths) == 1:
                merged = norm_paths[0]
                logger.info("[VIDEO] single clip — no xfade needed")
            else:
                merged = os.path.join(tmpdir, "merged.mp4")
                durations = [await self._get_duration(p) for p in norm_paths]
                fade_dur = min(FADE_DUR, min(durations) * 0.25)
                logger.info(f"[VIDEO] xfade {len(norm_paths)} clips fade={fade_dur:.2f}s transition={FADE_TRANSITION}")
                await self._xfade_clips(norm_paths, durations, fade_dur, merged)

            # 3b. Fade-in at start + fade-out at end (cinematic feel)
            faded = os.path.join(tmpdir, "faded.mp4")
            try:
                total_dur = await self._get_duration(merged)
                fade_out_start = max(0.0, total_dur - FADE_ENDS)
                await self._run_ffmpeg([
                    "ffmpeg", "-y", "-i", merged,
                    "-vf", f"fade=t=in:st=0:d={FADE_ENDS},fade=t=out:st={fade_out_start:.3f}:d={FADE_ENDS}",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                    "-pix_fmt", "yuv420p", "-an", faded,
                ])
                merged = faded
            except Exception as e:
                logger.warning(f"[VIDEO] fade-ends failed — skipping: {e}")

            # 4. Optional logo overlay
            logo_path = None
            if logo_url:
                logo_path = os.path.join(tmpdir, "logo.png")
                try:
                    await self._download_file(logo_url, logo_path)
                except Exception:
                    logo_path = None

            base = merged
            if logo_path:
                base = os.path.join(tmpdir, "with_logo.mp4")
                await self._run_ffmpeg([
                    "ffmpeg", "-y",
                    "-i", merged, "-loop", "1", "-i", logo_path,
                    "-filter_complex",
                    "[1:v]scale=iw*0.15:-1,format=rgba,colorchannelmixer=aa=0.85[logo];"
                    "[0:v][logo]overlay=W-w-30:H-h-30:shortest=1[v]",
                    "-map", "[v]", "-map", "0:a?",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                    "-c:a", "copy", "-movflags", "+faststart",
                    base,
                ])

            # 5. Mix voiceover
            output_path = os.path.join(tmpdir, "output.mp4")
            ass_path = build_ass_file(captions, os.path.join(tmpdir, "captions.ass")) if captions else None
            if voiceover_url:
                audio_path = os.path.join(tmpdir, "audio.mp3")
                await self._download_file(voiceover_url, audio_path)
                if ass_path:
                    await self._run_ffmpeg([
                        "ffmpeg", "-y",
                        "-i", base, "-i", audio_path,
                        "-vf", subtitles_filter(ass_path),
                        "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-t", str(duration_sec),
                        "-shortest", "-movflags", "+faststart",
                        output_path,
                    ])
                else:
                    await self._run_ffmpeg([
                        "ffmpeg", "-y",
                        "-i", base, "-i", audio_path,
                        "-c:v", "copy", "-c:a", "aac",
                        "-t", str(duration_sec),
                        "-shortest", "-movflags", "+faststart",
                        output_path,
                    ])
            else:
                await self._run_ffmpeg([
                    "ffmpeg", "-y", "-i", base,
                    "-c:v", "copy", "-an",
                    "-t", str(duration_sec),
                    "-movflags", "+faststart",
                    output_path,
                ])

            with open(output_path, "rb") as f:
                video_bytes = f.read()

        url = await storage_service.upload_bytes(
            data=video_bytes,
            filename=f"{job_id}_render.mp4",
            content_type="video/mp4",
            bucket="renders",
            prefix=job_id,
        )
        return {"url": url, "size_bytes": len(video_bytes)}

    async def render_video(
        self,
        job_id: str,
        voiceover_url: str,
        image_urls: list[str],
        duration_sec: int = 30,
        captions: list[dict] | None = None,
        style: str = "warm",
        headline: str = "",
        subtitle: str = "",
        logo_url: str = "",
        caption_style: str = "karaoke",
    ) -> dict:
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = None
            if voiceover_url:
                audio_path = os.path.join(tmpdir, "audio.mp3")
                await self._download_file(voiceover_url, audio_path)

            if image_urls:
                image_paths = []
                for i, img_url in enumerate(image_urls[:10]):
                    ext = os.path.splitext(img_url.split("?")[0])[1].lower() or ".jpg"
                    img_path = os.path.join(tmpdir, f"img_{i}{ext}")
                    if _is_video_file(img_path):
                        await self._download_file(img_url, img_path)
                    else:
                        await self._download_image_verified(img_url, img_path)
                    image_paths.append(img_path)
                video_path = await self._images_to_video(
                    image_paths, audio_path, tmpdir, duration_sec, captions, style, headline, subtitle,
                    caption_style,
                )
            else:
                video_path = await self._text_to_video(audio_path, tmpdir, duration_sec)

            if logo_url.strip():
                video_path = await self._append_logo_outro(video_path, logo_url.strip(), tmpdir)

            with open(video_path, "rb") as f:
                video_bytes = f.read()

            url = await storage_service.upload_bytes(
                data=video_bytes,
                filename=f"{job_id}_render.mp4",
                content_type="video/mp4",
                bucket="renders",
                prefix=job_id,
            )
            return {"url": url, "size_bytes": len(video_bytes)}

    async def remix_audio(
        self,
        job_id: str,
        video_url: str,
        voiceover_url: str,
        original_vol: float = 0.0,
        voice_vol: float = 1.0,
        audio_offset: float = 0.0,
    ) -> dict:
        """Take existing video file, replace/add/mix audio track — no re-render."""
        logger.info(f"[REMIX] start job={job_id} orig_vol={original_vol} voice_vol={voice_vol} offset={audio_offset} audio={voiceover_url[:60] if voiceover_url else 'NONE'}")
        delay_ms = int(audio_offset * 1000)
        delay_filter = f"adelay={delay_ms}|{delay_ms}," if delay_ms > 0 else ""
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, "source.mp4")
            await self._download_file(video_url, video_path)
            logger.info(f"[REMIX] video downloaded size={os.path.getsize(video_path)}")

            output_path = os.path.join(tmpdir, "output.mp4")
            if voiceover_url:
                audio_path = os.path.join(tmpdir, "audio.mp3")
                await self._download_file(voiceover_url, audio_path)
                logger.info(f"[REMIX] audio downloaded size={os.path.getsize(audio_path)}")

                if original_vol > 0:
                    # Mix mode: blend original video audio + voiceover
                    mix_filter = (
                        f"[0:a]volume={original_vol:.3f}[a0];"
                        f"[1:a]{delay_filter}volume={voice_vol:.3f}[a1];"
                        f"[a0][a1]amix=inputs=2:duration=first:dropout_transition=3[aout]"
                    )
                    try:
                        await self._run_ffmpeg([
                            "ffmpeg", "-y",
                            "-i", video_path, "-i", audio_path,
                            "-filter_complex", mix_filter,
                            "-map", "0:v:0", "-map", "[aout]",
                            "-c:v", "copy", "-c:a", "aac",
                            "-shortest", "-movflags", "+faststart",
                            output_path,
                        ])
                    except Exception as e:
                        # Original video has no audio stream — apply voice_vol only
                        logger.warning(f"[REMIX] amix failed (no source audio?) — voice-only with vol={voice_vol}. err={e}")
                        await self._run_ffmpeg([
                            "ffmpeg", "-y",
                            "-i", video_path, "-i", audio_path,
                            "-filter_complex", f"[1:a]{delay_filter}volume={voice_vol:.3f}[aout]",
                            "-map", "0:v:0", "-map", "[aout]",
                            "-c:v", "copy", "-c:a", "aac",
                            "-shortest", "-movflags", "+faststart",
                            output_path,
                        ])
                else:
                    # Replace mode: apply voice_vol to voiceover
                    await self._run_ffmpeg([
                        "ffmpeg", "-y",
                        "-i", video_path, "-i", audio_path,
                        "-filter_complex", f"[1:a]{delay_filter}volume={voice_vol:.3f}[aout]",
                        "-map", "0:v:0", "-map", "[aout]",
                        "-c:v", "copy", "-c:a", "aac",
                        "-shortest", "-movflags", "+faststart",
                        output_path,
                    ])
            else:
                logger.warning(f"[REMIX] no voiceover_url — stripping audio from job={job_id}")
                await self._run_ffmpeg([
                    "ffmpeg", "-y", "-i", video_path,
                    "-map", "0:v:0",
                    "-c:v", "copy", "-an",
                    "-movflags", "+faststart",
                    output_path,
                ])

            with open(output_path, "rb") as f:
                video_bytes = f.read()

        url = await storage_service.upload_bytes(
            data=video_bytes,
            filename=f"{job_id}_remixed.mp4",
            content_type="video/mp4",
            bucket="renders",
            prefix=job_id,
        )
        return {"url": url, "size_bytes": len(video_bytes)}

    async def _bake_title_card(
        self, video_path: str, style: str, headline: str, subtitle: str, tmpdir: str,
    ) -> str:
        """Burn the opening title card into the clip. Any style with a HyperFrames composition
        (see _TITLE_COMPOSITION_DIRS) tries the real spring/ease animated card first — rounded
        corners, box-shadow, proper pop/fade motion via headless Chrome — and falls back to the
        plain FFmpeg drawtext/drawbox overlay if that render isn't available or fails.

        (A per-beat design-text-overlay variant — one phrase per narration beat, timed
        across the whole clip — was tried and reverted: it read as cluttered stacked on top
        of the spoken-word captions.)"""
        out_path = os.path.join(tmpdir, "with_title.mp4")
        headline = _short_headline(headline)
        subtitle = _dedupe_subtitle(headline, subtitle)

        comp_dir = _TITLE_COMPOSITION_DIRS.get(style)
        title_path = await self._render_title_card_mov(comp_dir, headline, subtitle, tmpdir) if comp_dir else None
        if title_path:
            await self._run_ffmpeg([
                "ffmpeg", "-y", "-i", video_path, "-i", title_path,
                "-filter_complex",
                # eof_action=pass: overlay's default ("repeat") freezes the title MOV's
                # last frame and keeps compositing it for the rest of the clip once its
                # own ~3.5s duration ends — confirmed live, the title card never actually
                # went away. "pass" lets the base footage show through clean once the
                # title clip ends.
                "[1:v]format=yuva420p[title];[0:v][title]overlay=0:0:format=auto:eof_action=pass[outv]",
                "-map", "[outv]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
                "-an", out_path,
            ])
            return out_path

        if style == "midnight":
            overlay = _midnight_headline_overlay(headline, subtitle)
        elif style == "tv_shopping":
            overlay = _tv_shopping_headline_overlay(headline, subtitle)
        else:
            overlay = _editorial_headline_overlay(headline, subtitle)

        await self._run_ffmpeg([
            "ffmpeg", "-y", "-i", video_path,
            "-vf", overlay,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
            "-an", out_path,
        ])
        return out_path

    async def _render_title_card_mov(
        self, comp_dir: str | None, headline: str, subtitle: str, tmpdir: str,
    ) -> str | None:
        """Render an animated title card via HyperFrames (headless Chrome + GSAP) to a
        transparent MOV (ProRes 4444), for compositing on top of the Ken Burns clip. Returns
        None on any failure — callers must fall back to the plain drawtext overlay.

        Uses --format mov (ProRes 4444) rather than webm: confirmed by direct testing that this
        FFmpeg build round-trips ProRes 4444 alpha correctly but silently drops VP9-in-WebM
        alpha (decodes as fully opaque, which would have painted an opaque black box over the
        photo instead of the intended transparent title overlay)."""
        if not comp_dir or not os.path.exists(_HYPERFRAMES_BIN):
            return None
        out_path = os.path.join(tmpdir, "title_card.mov")
        variables = json.dumps({"headline": headline, "subtitle": subtitle})
        try:
            proc = await asyncio.create_subprocess_exec(
                _HYPERFRAMES_BIN, "render", comp_dir,
                "--format", "mov", "-o", out_path,
                "--variables", variables, "--quiet",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90)
            if proc.returncode != 0 or not os.path.exists(out_path):
                logger.warning(f"[VIDEO] hyperframes render failed (code={proc.returncode}): {stderr.decode()[-500:]}")
                return None
            return out_path
        except asyncio.TimeoutError:
            logger.warning("[VIDEO] hyperframes render timed out — falling back to drawtext title")
            return None
        except Exception as e:
            logger.warning(f"[VIDEO] hyperframes render errored ({e}) — falling back to drawtext title")
            return None

    async def _get_duration(self, path: str) -> float:
        """Get media duration in seconds via ffprobe's container-level format duration —
        NOT a specific stream's codec_type, since this must work for audio-only files (the
        voiceover .mp3) as well as video files. It used to only scan streams for
        codec_type=="video" and silently fall through to a hardcoded 5.0 on anything else,
        meaning every audio-duration probe in this file was always returning 5.0 regardless
        of the real narration length (confirmed live: two jobs with completely different
        scripts both logged the exact same "voiceover (5.0s)" — impossible for real content,
        it was always just the fallback firing — which fed straight into the render-length
        shrink/extend logic and produced wildly wrong clip lengths)."""
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format", path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        try:
            data = json.loads(stdout)
            return float(data["format"]["duration"])
        except Exception:
            return 5.0

    async def _has_audio_stream(self, video_path: str) -> bool:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", video_path,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        try:
            data = json.loads(stdout)
            return any(s.get("codec_type") == "audio" for s in data.get("streams", []))
        except Exception:
            return False

    async def _append_logo_outro(self, video_path: str, logo_url: str, tmpdir: str) -> str:
        """Fade the logo in as a watermark-style overlay on top of the clip's own final
        seconds — no separate black card appended after. A dedicated full-screen black outro
        (tried previously) read as a jarring dead-screen cut; this keeps the property footage
        visible underneath and doesn't change the clip's total length at all.

        Fades in a soft dark scrim behind the logo first — some source photos are already
        dark/busy there (confirmed live: a dim interior shot made the logo read as barely
        visible, almost "missing"), so legibility can't depend on the photo underneath being
        light enough on its own.

        (No extra brand-name text drawn below it — the logo image itself already carries the
        brand name/URL, so adding one was pure duplication.)"""
        logo_path = os.path.join(tmpdir, "outro_logo.png")
        try:
            await self._download_file(logo_url, logo_path)
        except Exception as e:
            logger.warning(f"[VIDEO] logo download failed — skipping outro: {e}")
            return video_path

        has_audio = await self._has_audio_stream(video_path)
        main_dur = await self._get_duration(video_path)
        overlay_dur = min(2.2, main_dur)
        start_t = max(0.0, main_dur - overlay_dur)

        out_path = os.path.join(tmpdir, "with_logo.mp4")
        # Fade in, then fade back out together with the footage's own end-of-clip fade-out
        # (same FADE_ENDS window) so the logo doesn't just hard-cut while the photo underneath
        # is already fading to black — reported live as wanting the logo to "stay with the
        # last image and fade out together" instead of cutting separately.
        # scale uses eval=frame for a gentle continuous scale-up so it doesn't sit frozen.
        fade_out_st = max(start_t, main_dur - FADE_ENDS)
        filter_parts = [
            f"[1:v]format=rgba,fade=t=in:st={start_t:.3f}:d=0.6:alpha=1,"
            f"fade=t=out:st={fade_out_st:.3f}:d={FADE_ENDS}:alpha=1,"
            f"colorchannelmixer=aa=0.35[scrim]",
            f"[0:v][scrim]overlay=0:0:format=auto[with_scrim]",
            f"[2:v]scale=w='iw*0.3*(1+0.05*(t-{start_t:.3f})/{overlay_dur:.3f})':h=-1:eval=frame,"
            f"format=rgba,fade=t=in:st={start_t:.3f}:d=0.5:alpha=1,"
            f"fade=t=out:st={fade_out_st:.3f}:d={FADE_ENDS}:alpha=1[logo]",
            f"[with_scrim][logo]overlay=(W-w)/2:(H-h)/2:format=auto[outv]",
        ]
        last_label = "outv"

        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-f", "lavfi", "-i", f"color=c=black:s={OUT_W}x{OUT_H}:d={main_dur:.3f}",
            "-loop", "1", "-i", logo_path,
            "-filter_complex", ";".join(filter_parts),
            "-map", f"[{last_label}]",
        ]
        if has_audio:
            cmd += ["-map", "0:a", "-c:a", "copy"]
        else:
            cmd += ["-an"]
        cmd += [
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
            "-t", f"{main_dur:.3f}", "-movflags", "+faststart", out_path,
        ]
        await self._run_ffmpeg(cmd)
        return out_path

    async def _xfade_clips(
        self,
        clip_paths: list[str],
        durations: list[float],
        fade_dur: float,
        output: str,
    ):
        """Chain clips with xfade dissolve transition using calculated offsets."""
        n = len(clip_paths)

        inputs = []
        for cp in clip_paths:
            inputs += ["-i", cp]

        # Build chained xfade filter
        # offset[i] = sum(d[0..i]) - (i+1)*fade_dur  (time in the chained stream where transition starts)
        filter_parts = []
        cumulative = 0.0

        for i in range(n - 1):
            cumulative += durations[i]
            offset = max(0.0, cumulative - (i + 1) * fade_dur)

            in_a = "[0:v]" if i == 0 else f"[v{i-1}{i}]"
            in_b = f"[{i+1}:v]"
            out_label = "[vout]" if i == n - 2 else f"[v{i}{i+1}]"

            filter_parts.append(
                f"{in_a}{in_b}xfade=transition={FADE_TRANSITION}"
                f":duration={fade_dur:.3f}:offset={offset:.3f}{out_label}"
            )

        await self._run_ffmpeg([
            "ffmpeg", "-y",
            *inputs,
            "-filter_complex", ";".join(filter_parts),
            "-map", "[vout]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "17",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            output,
        ])

    async def _download_file(self, url: str, dest: str):
        if url.startswith("/"):
            data = storage_service.download_bytes(url)
            with open(dest, "wb") as f:
                f.write(data)
        else:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                with open(dest, "wb") as f:
                    f.write(resp.content)

    async def _download_image_verified(self, url: str, dest: str, attempts: int = 2) -> None:
        """Download an image and verify it decodes cleanly before handing it to FFmpeg.
        FFmpeg's MJPEG decoder is lenient — a truncated/corrupted source file (a partial
        download, a mislabeled non-JPEG upload) still exits 0 and silently fills the missing
        region with decoder garbage (confirmed by reproducing it: solid-color/static blocks
        baked into every frame of the output). PIL raises on the same file, so re-encoding
        through it here also normalizes format/EXIF-rotation/color-mode quirks that could
        otherwise confuse FFmpeg's image2 demuxer."""
        last_error: Exception | None = None
        for attempt in range(attempts):
            await self._download_file(url, dest)
            try:
                img = Image.open(dest)
                img.load()
                img = img.convert("RGB")
                img.save(dest, "JPEG", quality=95)
                return
            except Exception as e:
                last_error = e
                logger.warning(f"[VIDEO] image failed to decode cleanly (attempt {attempt + 1}/{attempts}): {e}")
        raise RuntimeError(f"Downloaded image is corrupted after {attempts} attempts: {url[:80]} ({last_error})")

    async def _images_to_video(
        self, image_paths: list[str], audio_path: str | None, tmpdir: str, duration_sec: int,
        captions: list[dict] | None = None, style: str = "warm", headline: str = "", subtitle: str = "",
        caption_style: str = "karaoke",
    ) -> str:
        output_path = os.path.join(tmpdir, "output.mp4")

        # The AI writes the script to *target* duration_sec, but nothing guarantees the actual
        # TTS narration comes out that length exactly — confirmed live: a script that ran ~26s
        # got hard-cut at whatever duration_sec was, chopping the CTA off mid-sentence (the
        # final mux below used "-t duration_sec" unconditionally). If the voiceover is longer
        # than requested, extend the whole render to match it instead of truncating the audio —
        # the narration is what the viewer hears in full; a slightly longer video is a much
        # smaller problem than an ad that cuts itself off before finishing the pitch.
        if audio_path and os.path.exists(audio_path):
            audio_dur = await self._get_duration(audio_path)
            if audio_dur > duration_sec:
                logger.info(f"[VIDEO] voiceover ({audio_dur:.1f}s) longer than requested duration_sec "
                            f"({duration_sec}s) — extending render to fit the full narration")
                duration_sec = int(audio_dur) + 1
            elif audio_dur < duration_sec - 2:
                # Opposite problem, same root cause: the AI writes toward a *target* length but
                # the beat-pause TTS can come out noticeably shorter (confirmed live: requested
                # ~39s, actual narration only 26.5s) — leaving duration_sec at the longer
                # request stretches the Ken Burns slideshow to fill it anyway, so the clip plays
                # 10+ seconds of dead silent video after the narration has already finished.
                # Shrink to match the real narration instead (+1s buffer for the fade-out).
                logger.info(f"[VIDEO] voiceover ({audio_dur:.1f}s) shorter than requested duration_sec "
                            f"({duration_sec}s) — shrinking render so it doesn't end in dead silence")
                duration_sec = max(int(audio_dur) + 1, 6)

        n = len(image_paths)
        per_image = max(2.0, duration_sec / n)
        fps = 25
        d = int(per_image * fps)

        # Ken Burns effect rotates per image
        kb_builders = [_kb_zoom_in, _kb_zoom_out, _kb_pan_left, _kb_pan_right]

        clip_paths = []
        for i, img_path in enumerate(image_paths):
            clip_path = os.path.join(tmpdir, f"clip_{i}.mp4")
            if _is_video_file(img_path):
                # Already-moving footage — cover-crop + grade only, no Ken Burns zoompan.
                # -stream_loop splices the raw (undecoded) stream end-to-end, which can corrupt
                # frames that reference across the splice point on real-world footage (caused the
                # heavy noise/static artifacts seen in testing). Looping via the "loop" filter
                # instead operates on already-decoded frames, so there's no bitstream to corrupt —
                # only loop at all if the clip is actually shorter than its allotted slot.
                src_dur = await self._get_duration(img_path)
                base_vf = _video_segment_filter(style)
                if src_dur < per_image:
                    frame_count = max(1, int(src_dur * 25))
                    vf = f"loop=loop=-1:size={frame_count}:start=0,{base_vf}"
                else:
                    vf = base_vf
                await self._run_ffmpeg([
                    "ffmpeg", "-y", "-i", img_path,
                    "-vf", vf,
                    "-r", "25", "-vsync", "cfr",
                    "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                    "-t", str(per_image), "-an",
                    clip_path,
                ])
            else:
                vf = kb_builders[i % len(kb_builders)](d, style)
                await self._run_ffmpeg([
                    "ffmpeg", "-y",
                    "-loop", "1", "-i", img_path,
                    "-vf", vf,
                    "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                    "-t", str(per_image),
                    clip_path,
                ])
            clip_paths.append(clip_path)

        # Crossfade between Ken Burns clips too
        merged = os.path.join(tmpdir, "merged.mp4")
        if len(clip_paths) == 1:
            merged = clip_paths[0]
        else:
            durations = [per_image] * len(clip_paths)
            fade_dur = min(FADE_DUR, per_image * 0.15)
            await self._xfade_clips(clip_paths, durations, fade_dur, merged)

        # Fade-in + fade-out for Ken Burns too. Timed off the MERGED clip's own real duration,
        # not the target duration_sec — crossfade transitions between Ken Burns segments each
        # eat into the total (every transition overlaps two clips by fade_dur), so the merged
        # clip ends up shorter than duration_sec. Using duration_sec here put the fade-out's
        # start point past the clip's actual end, so it never triggered at all (confirmed live:
        # the very last frames were still at full brightness, no dimming whatsoever).
        faded_kb = os.path.join(tmpdir, "faded_kb.mp4")
        try:
            merged_dur = await self._get_duration(merged)
            fade_out_start = max(0.0, merged_dur - FADE_ENDS)
            await self._run_ffmpeg([
                "ffmpeg", "-y", "-i", merged,
                "-vf", f"fade=t=in:st=0:d={FADE_ENDS},fade=t=out:st={fade_out_start:.3f}:d={FADE_ENDS}",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-pix_fmt", "yuv420p", "-an", faded_kb,
            ])
            merged = faded_kb
        except Exception as e:
            logger.warning(f"[VIDEO] kb fade-ends failed — skipping: {e}")

        if headline.strip() and style in ("editorial", "prime", "midnight", "tv_shopping"):
            merged = await self._bake_title_card(merged, style, headline, subtitle, tmpdir)

        ass_path = build_ass_file(captions, os.path.join(tmpdir, "captions.ass"), caption_style) if captions else None
        vf = subtitles_filter(ass_path) if ass_path else ""

        if audio_path and os.path.exists(audio_path):
            if vf:
                await self._run_ffmpeg([
                    "ffmpeg", "-y",
                    "-i", merged, "-i", audio_path,
                    "-map", "0:v:0", "-map", "1:a:0",
                    "-vf", vf,
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-t", str(duration_sec),
                    "-movflags", "+faststart",
                    output_path,
                ])
            else:
                await self._run_ffmpeg([
                    "ffmpeg", "-y",
                    "-i", merged, "-i", audio_path,
                    "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-c:a", "aac",
                    "-t", str(duration_sec),
                    "-movflags", "+faststart",
                    output_path,
                ])
        elif vf:
            await self._run_ffmpeg([
                "ffmpeg", "-y", "-i", merged,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
                "-an", "-movflags", "+faststart",
                output_path,
            ])
        else:
            await self._run_ffmpeg([
                "ffmpeg", "-y", "-i", merged,
                "-c:v", "copy", "-an",
                "-movflags", "+faststart",
                output_path,
            ])
        return output_path

    async def _text_to_video(self, audio_path: str | None, tmpdir: str, duration_sec: int) -> str:
        output_path = os.path.join(tmpdir, "output.mp4")
        if audio_path and os.path.exists(audio_path):
            # Same fix as _images_to_video: -shortest would otherwise cut the audio off at
            # duration_sec if the narration runs longer than the requested target.
            audio_dur = await self._get_duration(audio_path)
            if audio_dur > duration_sec:
                duration_sec = int(audio_dur) + 1
            await self._run_ffmpeg([
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c=black:size={OUT_W}x{OUT_H}:rate=25:duration={duration_sec}",
                "-i", audio_path,
                "-c:v", "libx264", "-c:a", "aac",
                "-shortest", "-movflags", "+faststart",
                output_path,
            ])
        else:
            await self._run_ffmpeg([
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c=black:size={OUT_W}x{OUT_H}:rate=25:duration={duration_sec}",
                "-c:v", "libx264", "-movflags", "+faststart",
                output_path,
            ])
        return output_path

    async def _run_ffmpeg(self, cmd: list[str]):
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {' '.join(cmd)}\n{stderr.decode()[-600:]}")


video_service = VideoService()
