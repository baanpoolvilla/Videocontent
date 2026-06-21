#!/bin/bash
# Deploy script for AI Content Production Pipeline
# Run this on your Linux server

set -e

echo "=== AI Content Production Pipeline — Deploy ==="

# 1. Clone repo (first time)
if [ ! -d "Videocontent" ]; then
  git clone https://github.com/baanpoolvilla/Videocontent.git
  cd Videocontent
else
  cd Videocontent
  git pull origin main
fi

# 2. Create .env if not exists
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "!!! กรุณาแก้ไขไฟล์ .env ก่อน deploy !!!"
  echo "    nano .env"
  echo ""
  echo "ต้องแก้ไข:"
  echo "  DOMAIN=           <- ใส่ IP หรือ domain ของ server"
  echo "  POSTGRES_PASSWORD=  <- ใส่ password ที่แข็งแกร่ง"
  echo "  MINIO_ROOT_PASSWORD= <- ใส่ password ที่แข็งแกร่ง"
  echo "  N8N_ENCRYPTION_KEY= <- ใส่ random string 32 ตัวอักษร"
  echo "  SECRET_KEY=         <- ใส่ random string ยาวๆ"
  echo "  ANTHROPIC_API_KEY=  <- ใส่ API key จาก Anthropic"
  echo "  ELEVENLABS_API_KEY= <- ใส่ API key จาก ElevenLabs"
  echo "  KLING_API_KEY=      <- ใส่ API key จาก Kling"
  echo ""
  exit 1
fi

# 3. Build and start containers
echo "Starting containers..."
docker compose pull
docker compose up -d --build

# 4. Show status
echo ""
echo "=== Deploy สำเร็จ! ==="
docker compose ps
echo ""
echo "เข้าใช้งานได้ที่:"
source .env
echo "  Frontend:   http://${DOMAIN}:3000"
echo "  API:        http://${DOMAIN}:8000"
echo "  n8n:        http://${DOMAIN}:5678"
echo "  MinIO:      http://${DOMAIN}:9001"
echo "  Grafana:    http://${DOMAIN}:3001"
echo "  Traefik:    http://${DOMAIN}:8080"
