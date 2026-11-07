from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    env: str = "development"
    log_level: str = "info"

    # Database
    database_url: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Qdrant
    qdrant_url: str = "http://localhost:6333"

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # AI Provider keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""
    deepseek_api_key: str = ""
    mistral_api_key: str = ""
    grok_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"

    # Default models per task type
    model_coding: str = "claude-sonnet-4-6"
    model_research: str = "gemini-2.0-flash"
    model_math: str = "deepseek-chat"
    model_creative: str = "gpt-4o"
    model_general: str = "claude-sonnet-4-6"
    model_security: str = "claude-sonnet-4-6"
    model_testing: str = "claude-sonnet-4-6"

    # Debate system
    debate_enabled: bool = True
    debate_min_providers: int = 2   # need at least 2 providers for debate

    # Notifications
    webhook_url: str = ""   # POSTed a JSON payload when a task completes/fails


@lru_cache
def get_settings() -> Settings:
    return Settings()
