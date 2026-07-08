FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev ffmpeg fonts-thai-tlwg curl gnupg \
    && rm -rf /var/lib/apt/lists/*

# Node.js + HyperFrames (github.com/heygen-com/hyperframes) — renders HTML/CSS/GSAP
# compositions to video via headless Chrome, used for smoother title-card animations than
# hand-written FFmpeg drawtext expressions can express. Apache 2.0, free at any scale.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    # Headless Chrome runtime libs (Puppeteer's documented Debian dependency list, adjusted
    # for Debian 13 "trixie" package names — several libs got a "t64" suffix in the 2024
    # time_t transition: asound2, atk-bridge2.0-0, atk1.0-0, cups2, glib2.0-0, gtk-3-0)
    && apt-get install -y --no-install-recommends \
       ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 \
       libcairo2 libcups2t64 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0t64 \
       libgtk-3-0t64 libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
       libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 xdg-utils wget \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Install HyperFrames as a pinned local dependency (not npx — avoids a registry hit and
# version drift on every render) and pre-warm its headless Chrome download at build time,
# so the first real render doesn't pay a ~100MB download + extraction cost at runtime.
WORKDIR /opt/hyperframes-runtime
RUN npm init -y \
    && npm install hyperframes@0.7.42 \
    && node_modules/.bin/hyperframes render /app/app/assets/hyperframes/prime_location \
       --format mov -o /tmp/warmup.mov --quiet \
    && rm -f /tmp/warmup.mov
WORKDIR /app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
