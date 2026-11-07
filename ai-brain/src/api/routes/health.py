from fastapi import APIRouter
from ...api.deps import get_provider_registry

router = APIRouter()


@router.get("/health")
async def health():
    registry = get_provider_registry()
    return {
        "status": "ok",
        "providers_available": registry.available_providers(),
    }
