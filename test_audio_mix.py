"""
Test script: audio insert + volume control
รันบน server: docker exec -it videocontent-backend python /app/test_audio_mix.py
"""
import asyncio, httpx, json, time

BASE = "http://localhost:8000/api/v1"
TOKEN = None

# ── auth ──────────────────────────────────────────────────
async def login(client):
    r = await client.post(f"{BASE}/auth/login",
        data={"username": "admin", "password": "admin1234"},
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]

# ── helpers ───────────────────────────────────────────────
async def wait_job(client, job_id, headers, timeout=120):
    for _ in range(timeout // 3):
        await asyncio.sleep(3)
        r = await client.get(f"{BASE}/jobs/{job_id}", headers=headers)
        s = r.json().get("status")
        if s in ("completed", "failed"):
            return s
    return "timeout"

async def get_latest_render(client, job_id, headers):
    r = await client.get(f"{BASE}/jobs/{job_id}/renders", headers=headers)
    renders = [x for x in r.json() if x.get("final_video_url")]
    return renders[0] if renders else None

# ── main ──────────────────────────────────────────────────
async def main():
    async with httpx.AsyncClient(timeout=180) as client:
        token = await login(client)
        h = {"Authorization": f"Bearer {token}"}
        print("✓ Login OK")

        # 1. สร้างเสียงพากย์
        print("\n[1] สร้างเสียงพากย์ด้วย Edge TTS...")
        r = await client.post(f"{BASE}/voice/generate",
            json={"text": "วิลล่าพูลส่วนตัว วิวทะเล บรรยากาศหรูหรา", "voice_style": "หญิง (ไทย)", "lang": "th"},
            headers=h)
        assert r.status_code == 200, f"TTS failed: {r.text}"
        audio_url = r.json()["url"]
        print(f"  ✓ audio_url = {audio_url[:60]}...")

        # 2. หา job ที่ completed อยู่แล้ว
        print("\n[2] หา completed job...")
        r = await client.get(f"{BASE}/jobs/?limit=20", headers=h)
        jobs = [j for j in r.json() if j["status"] == "completed"]
        assert jobs, "ไม่มี completed job — render วิดีโอก่อน"
        job_id = jobs[0]["id"]
        print(f"  ✓ job_id = {job_id}")

        render_before = await get_latest_render(client, job_id, h)
        assert render_before, "ไม่มี render"
        print(f"  ✓ render ก่อน = {render_before['final_video_url'][-40:]}")

        # ── TEST A: ใส่เสียงปกติ (voice_vol=100%) ──
        print("\n[TEST A] ใส่เสียง voice_vol=1.0...")
        r = await client.post(f"{BASE}/jobs/{job_id}/remix-audio",
            params={"voiceover_url": audio_url, "voice_vol": 1.0, "original_vol": 0.0},
            headers=h)
        assert r.status_code == 200, f"remix failed: {r.text}"
        status = await wait_job(client, job_id, h)
        assert status == "completed", f"job status={status}"
        render_a = await get_latest_render(client, job_id, h)
        assert render_a and render_a["id"] != render_before["id"], "render ไม่เปลี่ยน!"
        print(f"  ✓ PASS — render ใหม่ = {render_a['final_video_url'][-40:]}")

        # ── TEST B: ลดเสียง 50% ──
        print("\n[TEST B] ลดเสียง voice_vol=0.5...")
        r = await client.post(f"{BASE}/jobs/{job_id}/remix-audio",
            params={"voiceover_url": audio_url, "voice_vol": 0.5, "original_vol": 0.0},
            headers=h)
        assert r.status_code == 200, f"remix failed: {r.text}"
        status = await wait_job(client, job_id, h)
        assert status == "completed", f"job status={status}"
        render_b = await get_latest_render(client, job_id, h)
        assert render_b and render_b["id"] != render_a["id"], "render ไม่เปลี่ยน!"
        print(f"  ✓ PASS — render เสียง 50% = {render_b['final_video_url'][-40:]}")

        # ── TEST C: ปิดเสียง (voice_vol=0) ──
        print("\n[TEST C] ปิดเสียงพากย์ voice_vol=0.0...")
        r = await client.post(f"{BASE}/jobs/{job_id}/remix-audio",
            params={"voiceover_url": audio_url, "voice_vol": 0.0, "original_vol": 0.0},
            headers=h)
        assert r.status_code == 200, f"remix failed: {r.text}"
        status = await wait_job(client, job_id, h)
        assert status == "completed", f"job status={status}"
        render_c = await get_latest_render(client, job_id, h)
        assert render_c and render_c["id"] != render_b["id"], "render ไม่เปลี่ยน!"
        print(f"  ✓ PASS — render เสียง 0% = {render_c['final_video_url'][-40:]}")

        print("\n══════════════════════════════════")
        print("✅ ทุก test ผ่าน!")
        print(f"  A (100%) → {render_a['final_video_url']}")
        print(f"  B (50%)  → {render_b['final_video_url']}")
        print(f"  C (0%)   → {render_c['final_video_url']}")

asyncio.run(main())
