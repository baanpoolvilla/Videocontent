import asyncio
import base64
import io
import logging
import random
import re
import tempfile
import os
import httpx
from app.core.config import settings
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

# Max words grouped into one on-screen caption chunk (OpusClip-style short bursts)
_CAPTION_CHUNK_WORDS = 4

_THAI_CHAR_RE = re.compile(r"[฀-๿]")


def _join_caption_words(texts: list[str]) -> str:
    """Thai has no inter-word spaces, so joining Thai words with English-style spaces reads
    as broken/childish ("ที่ คุณ รัก ไหม" instead of "ที่คุณรักไหม") — but that's only true
    between two Thai words. A caption chunk mixing in an English brand name needs the space
    kept (confirmed live: an all-or-nothing rule squished "Sicily" + "Poolvilla" together into
    "SicilyPoolvilla"), since Thai readers still expect a gap around an embedded Latin term.
    Drop the separator only when BOTH sides of a boundary are Thai."""
    if not texts:
        return ""
    out = texts[0]
    for prev, curr in zip(texts, texts[1:]):
        both_thai = _THAI_CHAR_RE.search(prev) and _THAI_CHAR_RE.search(curr)
        out += curr if both_thai else f" {curr}"
    return out


def _group_words_into_captions(words: list[dict], chunk_size: int = _CAPTION_CHUNK_WORDS) -> list[dict]:
    """Group [{text, start, end}, ...] word timings into readable multi-word caption chunks."""
    captions = []
    for i in range(0, len(words), chunk_size):
        group = words[i:i + chunk_size]
        if not group:
            continue
        texts = [w["text"] for w in group]
        text = _join_caption_words(texts)
        captions.append({
            "text": text,
            "start": group[0]["start"],
            "end": group[-1]["end"],
            # Per-word timing preserved (not just the group's start/end) so captions.py can
            # render real karaoke-style word highlighting instead of the whole chunk lighting
            # up at once.
            "words": [{"text": w["text"], "start": w["start"], "end": w["end"]} for w in group],
        })
    return captions


async def _probe_audio_duration(path: str) -> float:
    """Get audio duration in seconds via ffprobe (used for the proportional-timing fallback)."""
    import asyncio
    import json as _json
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, _ = await proc.communicate()
    try:
        return float(_json.loads(out.decode())["format"]["duration"])
    except Exception:
        return 0.0


_THAI_CAPTION_CHUNK_CHARS = 16  # ~one short on-screen burst at the caption font size/frame width


def _proportional_captions(text: str, total_duration: float, chunk_size: int = _CAPTION_CHUNK_WORDS) -> list[dict]:
    """Fallback timing when no native timestamp API is available (e.g. gTTS, or Edge TTS
    voices that occasionally refuse WordBoundary mode): distribute caption chunks across
    total_duration proportional to character count."""
    if total_duration <= 0 or not text.strip():
        return []
    is_thai = bool(_THAI_CHAR_RE.search(text))
    if is_thai:
        # text.split() can't chunk Thai at all — there are no inter-word spaces to split on,
        # so it silently returned the ENTIRE sentence as a single "word"/chunk (confirmed live:
        # a full clause rendered as one giant caption that overflowed the frame). Fall back to
        # fixed-size character bursts instead, which at least reads as a normal caption length.
        chunks = [text[i:i + _THAI_CAPTION_CHUNK_CHARS] for i in range(0, len(text), _THAI_CAPTION_CHUNK_CHARS)]
    else:
        words = text.split()
        if not words:
            return []
        chunks = [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]
    if not chunks:
        return []
    total_chars = sum(len(c) for c in chunks) or 1
    captions = []
    t = 0.0
    for c in chunks:
        dur = total_duration * (len(c) / total_chars)
        captions.append({"text": c, "start": round(t, 3), "end": round(t + dur, 3)})
        t += dur
    return captions

# ElevenLabs voice IDs (multilingual v2 — supports Thai)
ELEVENLABS_VOICE_MAP = {
    "เป็นกันเอง (หญิง)": "21m00Tcm4TlvDq8ikWAM",  # Rachel
    "มืออาชีพ (ชาย)":    "pNInz6obpgDQGcFmaJgB",  # Adam
    "สดใส (หญิง)":       "EXAVITQu4vr4xnSDxMaL",  # Bella
    "หนักแน่น (ชาย)":    "VR6AewLTigWG4xSOukaG",  # Arnold
}

# Edge TTS — Microsoft neural voices, free, Thai-native
# NOTE: th-TH-AcharaNeural (former "second female" option) no longer exists on Microsoft's
# service — confirmed via edge_tts.list_voices(), which now returns only these two Thai voices.
EDGE_VOICE_MAP = {
    "หญิง (ไทย)":   "th-TH-PremwadeeNeural",   # natural, warm female
    "ชาย (ไทย)":    "th-TH-NiwatNeural",        # clear, professional male
}

# Default voices per style key (used when caller passes ElevenLabs-style names)
EDGE_STYLE_TO_VOICE = {
    "เป็นกันเอง (หญิง)": "th-TH-PremwadeeNeural",
    "มืออาชีพ (ชาย)":    "th-TH-NiwatNeural",
    "สดใส (หญิง)":       "th-TH-PremwadeeNeural",
    "หนักแน่น (ชาย)":    "th-TH-NiwatNeural",
    "หญิง (ไทย)":        "th-TH-PremwadeeNeural",
    "ชาย (ไทย)":         "th-TH-NiwatNeural",
}


class TTSService:
    async def generate_voiceover(
        self,
        text: str,
        job_id: str,
        voice_style: str = "หญิง (ไทย)",
        lang: str = "th",
    ) -> dict:
        """
        Priority:
          1. ElevenLabs  — if ELEVENLABS_API_KEY set
          2. Edge TTS    — free Microsoft neural Thai voice (default)
          3. gTTS        — last resort fallback
        """
        # Skip ElevenLabs for Thai Edge TTS voices — use Edge TTS directly
        is_thai_voice = voice_style in EDGE_VOICE_MAP or voice_style in EDGE_STYLE_TO_VOICE and EDGE_STYLE_TO_VOICE[voice_style].startswith("th-TH")
        if settings.ELEVENLABS_API_KEY and not is_thai_voice:
            logger.info(f"[TTS] using ElevenLabs voice_style={voice_style}")
            try:
                return await self._elevenlabs(text, job_id, voice_style)
            except Exception as e:
                logger.warning(f"[TTS] ElevenLabs failed ({e}) — falling back to Edge TTS")

        logger.info(f"[TTS] using Edge TTS voice_style={voice_style}")
        try:
            return await self._edge_tts(text, job_id, voice_style)
        except Exception as e:
            logger.warning(f"[TTS] Edge TTS failed ({e}) — falling back to gTTS")
            return await self._gtts(text, job_id, lang)

    async def generate_voiceover_beats(
        self,
        beats: list[str],
        job_id: str,
        voice_style: str = "หญิง (ไทย)",
        lang: str = "th",
        pause_range: tuple[float, float] = (0.6, 1.1),
        cta_pause_range: tuple[float, float] = (1.2, 1.6),
    ) -> dict:
        """Generate voiceover with real silence gaps between beats — natural breathing room
        instead of one unbroken block of narration for the whole clip. Gap length is randomized
        per-gap (not a fixed duration every time, which reads as mechanical), and the gap right
        before the final beat (the CTA) is longer, like a real narrator pausing before the ask.

        Synthesizes the FULL script as ONE continuous TTS call and then cuts silence gaps into
        that single recording at beat boundaries — rather than synthesizing each beat as its own
        isolated TTS call and splicing the results together. The old per-beat approach made every
        voice engine treat each beat as a fresh, standalone sentence (its own start/end intonation),
        which read as choppy/disjointed once stitched with hard digital silence. Cutting one
        continuous natural reading instead preserves real cross-sentence prosody."""
        beats = [b.strip() for b in beats if b and b.strip()]
        if len(beats) <= 1:
            text = beats[0] if beats else ""
            return await self.generate_voiceover(text=text, job_id=job_id, voice_style=voice_style, lang=lang)

        full_text = " ".join(beats)
        voice_result = await self.generate_voiceover(text=full_text, job_id=job_id, voice_style=voice_style, lang=lang)
        words = voice_result.get("words") or []

        if not words:
            logger.warning("[TTS] no word-level timing available — falling back to per-beat synthesis")
            return await self._generate_voiceover_beats_legacy(
                beats, job_id, voice_style, lang, pause_range, cta_pause_range,
            )

        # Locate each beat boundary by character-length proportion rather than word count —
        # Edge TTS's WordBoundary events for Thai don't correspond to whitespace-delimited
        # "words" at all (Thai has no inter-word spaces), so beat.split() undercounts by a
        # huge margin (confirmed live: 14 vs 112) and every job silently fell back to the
        # choppy per-beat path. Speaking rate is roughly steady for a given voice, so mapping
        # character position -> proportional time in the continuous recording lands within a
        # few hundred ms of the real word boundary, which is what actually matters here.
        total_start = words[0]["start"]
        total_span = words[-1]["end"] - total_start
        total_chars = len(full_text) or 1

        num_gaps = len(beats) - 1
        gap_durations = [
            round(random.uniform(*(cta_pause_range if i == num_gaps - 1 else pause_range)), 2)
            for i in range(num_gaps)
        ]

        # Assign each beat an exact WORD-INDEX range (not just a single cut point) so its
        # segment can be trimmed to exactly [first_word.start, last_word.end] — discarding any
        # natural pause on BOTH sides. Cutting at a single boundary point only trims the
        # trailing silence of the beat before it; the natural pause before the NEXT beat's
        # first word was still being carried into that beat's segment and stacking with our
        # own inserted gap (confirmed live: ~2s gaps where the designed range was 0.6-1.6s).
        word_starts = [w["start"] for w in words]
        boundary_indices = []
        cum_chars = 0
        for i in range(num_gaps):
            cum_chars += len(beats[i]) + 1  # +1 for the space joining this beat to the next
            frac = min(cum_chars / total_chars, 1.0)
            estimate = total_start + frac * total_span
            idx = min(range(len(word_starts)), key=lambda j: abs(word_starts[j] - estimate))
            boundary_indices.append(idx)

        # range_bounds[i] : range_bounds[i+1] = the word indices belonging to beat i. Force
        # strictly increasing bounds so no beat ever collapses to zero words if two estimates
        # land on the same nearest word.
        range_bounds = [0]
        for idx in boundary_indices:
            range_bounds.append(max(idx, range_bounds[-1] + 1))
        range_bounds.append(max(len(words), range_bounds[-1] + 1))
        n_segments = len(range_bounds) - 1

        seg_orig_start = []
        seg_orig_end = []
        for i in range(n_segments):
            start_idx = range_bounds[i]
            end_idx = min(range_bounds[i + 1], len(words)) - 1
            seg_orig_start.append(0.0 if i == 0 else words[start_idx]["start"])
            seg_orig_end.append(words[end_idx]["end"])

        with tempfile.TemporaryDirectory() as tmpdir:
            src_path = os.path.join(tmpdir, "full.mp3")
            with open(src_path, "wb") as f:
                f.write(storage_service.download_bytes(voice_result["url"]))

            segment_paths = []
            for i in range(n_segments):
                seg_path = os.path.join(tmpdir, f"seg_{i}.mp3")
                await self._run_ffmpeg_audio([
                    "ffmpeg", "-y", "-i", src_path,
                    "-ss", str(seg_orig_start[i]), "-to", str(seg_orig_end[i]),
                    "-c:a", "libmp3lame", "-q:a", "4", seg_path,
                ])
                segment_paths.append(seg_path)

            gap_paths = []
            for i, dur in enumerate(gap_durations):
                gap_path = os.path.join(tmpdir, f"gap_{i}.mp3")
                await self._run_ffmpeg_audio([
                    "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                    "-t", str(dur), "-q:a", "9", gap_path,
                ])
                gap_paths.append(gap_path)

            concat_list_path = os.path.join(tmpdir, "concat.txt")
            with open(concat_list_path, "w", encoding="utf-8") as f:
                for i, path in enumerate(segment_paths):
                    f.write(f"file '{path}'\n")
                    if i < len(gap_paths):
                        f.write(f"file '{gap_paths[i]}'\n")

            final_path = os.path.join(tmpdir, "final.mp3")
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list_path,
                "-c:a", "libmp3lame", "-q:a", "4", final_path,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                raise RuntimeError(f"Beat concat failed: {stderr.decode()[-500:]}")

            # Map a timestamp in the ORIGINAL continuous recording to where it now lands in the
            # trimmed-and-gapped final audio. A timestamp inside a kept segment shifts by that
            # segment's cumulative offset; one that fell inside a now-discarded natural pause
            # (between segments) clamps to the end of the segment before it, since that stretch
            # no longer exists in the output at all.
            seg_final_offset = []
            offset = 0.0
            for i in range(n_segments):
                seg_final_offset.append(offset)
                offset += seg_orig_end[i] - seg_orig_start[i]
                if i < len(gap_durations):
                    offset += gap_durations[i]

            def _remap(t: float) -> float:
                for i in range(n_segments):
                    if seg_orig_start[i] <= t <= seg_orig_end[i]:
                        return (t - seg_orig_start[i]) + seg_final_offset[i]
                for i in range(n_segments - 1, -1, -1):
                    if seg_orig_end[i] <= t:
                        return seg_final_offset[i] + (seg_orig_end[i] - seg_orig_start[i])
                return seg_final_offset[0]

            all_captions: list[dict] = []
            for c in voice_result.get("captions", []):
                all_captions.append({
                    "text": c["text"],
                    "start": round(_remap(c["start"]), 3),
                    "end": round(_remap(c["end"]), 3),
                    "words": [
                        {"text": w["text"], "start": round(_remap(w["start"]), 3), "end": round(_remap(w["end"]), 3)}
                        for w in c.get("words", [])
                    ],
                })

            with open(final_path, "rb") as f:
                final_bytes = f.read()

        url = await storage_service.upload_bytes(
            data=final_bytes, filename=f"{job_id}_voiceover.mp3",
            content_type="audio/mpeg", bucket="assets", prefix=f"voiceovers/{job_id}",
        )
        logger.info(f"[TTS] beats done (single-take): {len(beats)} beats, gaps={gap_durations}, total_captions={len(all_captions)}")
        return {
            "url": url,
            "characters_used": len(full_text),
            "voice_id": voice_result.get("voice_id", ""),
            "model_id": voice_result.get("model_id", "edge-tts"),
            "captions": all_captions,
        }

    async def _generate_voiceover_beats_legacy(
        self,
        beats: list[str],
        job_id: str,
        voice_style: str,
        lang: str,
        pause_range: tuple[float, float],
        cta_pause_range: tuple[float, float],
    ) -> dict:
        """Fallback for engines with no word-level timing (e.g. gTTS): synthesize each beat as
        its own isolated TTS call and splice with silence. Less natural than the single-take
        path in generate_voiceover_beats (each beat gets its own fresh sentence intonation),
        but the only option without per-word timestamps to cut a continuous recording at."""
        beat_results = [
            await self.generate_voiceover(text=b, job_id=f"{job_id}_b{i}", voice_style=voice_style, lang=lang)
            for i, b in enumerate(beats)
        ]

        num_gaps = len(beat_results) - 1
        gap_durations = [
            round(random.uniform(*(cta_pause_range if i == num_gaps - 1 else pause_range)), 2)
            for i in range(num_gaps)
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            audio_paths = []
            for i, r in enumerate(beat_results):
                path = os.path.join(tmpdir, f"beat_{i}.mp3")
                with open(path, "wb") as f:
                    f.write(storage_service.download_bytes(r["url"]))
                audio_paths.append(path)

            gap_paths = []
            for i, dur in enumerate(gap_durations):
                gap_path = os.path.join(tmpdir, f"gap_{i}.mp3")
                await self._run_ffmpeg_audio([
                    "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                    "-t", str(dur), "-q:a", "9", gap_path,
                ])
                gap_paths.append(gap_path)

            concat_list_path = os.path.join(tmpdir, "concat.txt")
            with open(concat_list_path, "w", encoding="utf-8") as f:
                for i, path in enumerate(audio_paths):
                    f.write(f"file '{path}'\n")
                    if i < len(audio_paths) - 1:
                        f.write(f"file '{gap_paths[i]}'\n")

            final_path = os.path.join(tmpdir, "final.mp3")
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list_path,
                "-c:a", "libmp3lame", "-q:a", "4", final_path,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                raise RuntimeError(f"Beat concat failed: {stderr.decode()[-500:]}")

            all_captions: list[dict] = []
            offset = 0.0
            for i, (r, path) in enumerate(zip(beat_results, audio_paths)):
                dur = await _probe_audio_duration(path)
                for c in r.get("captions", []):
                    all_captions.append({
                        "text": c["text"],
                        "start": round(c["start"] + offset, 3),
                        "end": round(c["end"] + offset, 3),
                        "words": [
                            {"text": w["text"], "start": round(w["start"] + offset, 3), "end": round(w["end"] + offset, 3)}
                            for w in c.get("words", [])
                        ],
                    })
                offset += dur + (gap_durations[i] if i < num_gaps else 0)

            with open(final_path, "rb") as f:
                final_bytes = f.read()

        url = await storage_service.upload_bytes(
            data=final_bytes, filename=f"{job_id}_voiceover.mp3",
            content_type="audio/mpeg", bucket="assets", prefix=f"voiceovers/{job_id}",
        )
        logger.info(f"[TTS] beats done (legacy per-beat): {len(beats)} beats, gaps={gap_durations}, total_captions={len(all_captions)}")
        return {
            "url": url,
            "characters_used": sum(len(b) for b in beats),
            "voice_id": beat_results[0].get("voice_id", ""),
            "model_id": beat_results[0].get("model_id", "edge-tts"),
            "captions": all_captions,
        }

    @staticmethod
    async def _run_ffmpeg_audio(cmd: list[str]) -> None:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg audio command failed: {stderr.decode()[-500:]}")

    async def _edge_tts(self, text: str, job_id: str, voice_style: str) -> dict:
        import edge_tts

        voice = EDGE_STYLE_TO_VOICE.get(voice_style, "th-TH-PremwadeeNeural")
        logger.info(f"[TTS] Edge TTS voice={voice} chars={len(text)}")

        # boundary="WordBoundary" must be requested explicitly — the library defaults to
        # SentenceBoundary. Confirmed by live testing that some voices (e.g. th-TH-AcharaNeural)
        # reject WordBoundary mode outright (NoAudioReceived) even though the voice works fine
        # otherwise — so this must retry without it rather than fail the whole request.
        audio_chunks: list[bytes] = []
        words: list[dict] = []
        try:
            communicate = edge_tts.Communicate(text, voice, boundary="WordBoundary")
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    # offset/duration are in 100-nanosecond units — convert to seconds
                    start = chunk["offset"] / 1e7
                    dur = chunk["duration"] / 1e7
                    words.append({"text": chunk["text"], "start": round(start, 3), "end": round(start + dur, 3)})
        except Exception as e:
            logger.warning(f"[TTS] Edge TTS WordBoundary mode failed for voice={voice} ({e}) — retrying without it")
            audio_chunks, words = [], []
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])

        audio_bytes = b"".join(audio_chunks)
        if not audio_bytes:
            raise RuntimeError("Edge TTS returned empty audio")

        if words:
            captions = _group_words_into_captions(words)
        else:
            # Defensive fallback — some Edge TTS voices/inputs don't emit WordBoundary events
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name
            try:
                duration = await _probe_audio_duration(tmp_path)
            finally:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
            captions = _proportional_captions(text, duration)
            logger.warning(f"[TTS] Edge TTS emitted no WordBoundary events — using proportional fallback ({len(captions)} chunks)")

        url = await storage_service.upload_bytes(
            data=audio_bytes,
            filename=f"{job_id}_voiceover.mp3",
            content_type="audio/mpeg",
            bucket="assets",
            prefix=f"voiceovers/{job_id}",
        )
        logger.info(f"[TTS] Edge TTS done size={len(audio_bytes)} url={url[:60]} words={len(words)} captions={len(captions)}")
        return {
            "url": url, "characters_used": len(text), "voice_id": voice, "model_id": "edge-tts",
            "captions": captions, "words": words,
        }

    async def _elevenlabs(self, text: str, job_id: str, voice_style: str) -> dict:
        voice_id = ELEVENLABS_VOICE_MAP.get(voice_style, "21m00Tcm4TlvDq8ikWAM")
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps",
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                },
            )
            if not resp.is_success:
                raise RuntimeError(f"ElevenLabs {resp.status_code}: {resp.text[:100]}")
            payload = resp.json()
            audio_bytes = base64.b64decode(payload["audio_base64"])
            captions = self._captions_from_char_alignment(payload.get("alignment") or {})

        url = await storage_service.upload_bytes(
            data=audio_bytes,
            filename=f"{job_id}_voiceover.mp3",
            content_type="audio/mpeg",
            bucket="assets",
            prefix=f"voiceovers/{job_id}",
        )
        return {
            "url": url, "characters_used": len(text), "voice_id": voice_id, "model_id": "eleven_multilingual_v2",
            "captions": captions,
        }

    @staticmethod
    def _captions_from_char_alignment(alignment: dict) -> list[dict]:
        """ElevenLabs with-timestamps returns per-character start/end times — rebuild word
        timings by splitting on whitespace, then group into caption chunks."""
        chars = alignment.get("characters") or []
        starts = alignment.get("character_start_times_seconds") or []
        ends = alignment.get("character_end_times_seconds") or []
        if not chars or len(chars) != len(starts):
            return []

        words: list[dict] = []
        buf, w_start = "", None
        for ch, s, e in zip(chars, starts, ends):
            if ch.isspace():
                if buf:
                    words.append({"text": buf, "start": round(w_start, 3), "end": round(prev_end, 3)})
                    buf, w_start = "", None
                continue
            if w_start is None:
                w_start = s
            buf += ch
            prev_end = e
        if buf:
            words.append({"text": buf, "start": round(w_start, 3), "end": round(prev_end, 3)})

        return _group_words_into_captions(words)

    async def _gtts(self, text: str, job_id: str, lang: str) -> dict:
        from gtts import gTTS
        tts = gTTS(text=text, lang=lang, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        audio_bytes = buf.getvalue()

        # gTTS has no native timestamp API — estimate caption timing proportionally
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            duration = await _probe_audio_duration(tmp_path)
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
        captions = _proportional_captions(text, duration)

        url = await storage_service.upload_bytes(
            data=audio_bytes,
            filename=f"{job_id}_voiceover.mp3",
            content_type="audio/mpeg",
            bucket="assets",
            prefix=f"voiceovers/{job_id}",
        )
        return {
            "url": url, "characters_used": len(text), "voice_id": "gtts-th", "model_id": "google-tts",
            "captions": captions,
        }


tts_service = TTSService()
