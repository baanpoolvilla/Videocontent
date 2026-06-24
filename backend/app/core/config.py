from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Content Pipeline"
    VERSION: str = "1.1.0"
    API_PREFIX: str = "/api/v1"

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_SECURE: bool = False

    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    KLING_API_KEY: str = ""
    FAL_KEY: str = ""
    API_BASE_URL: str = "http://localhost:8000"

    N8N_WEBHOOK_URL: str = "http://n8n:5678"

    CORS_ORIGINS: str = "http://localhost:3000"

    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    LINE_CHANNEL_ACCESS_TOKEN: str = ""
    DISCORD_WEBHOOK_URL: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
