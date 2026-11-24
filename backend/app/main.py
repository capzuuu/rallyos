from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.v1.router import api_router
from app.core.config import settings, validate_production_security
from app.db import session as db_session
from app.schemas.common import HealthResponse


@asynccontextmanager
async def lifespan(_app: FastAPI):
    validate_production_security(settings)
    if settings.APP_ENV != "testing":
        db_session.initialize_runtime_database()
    yield


def create_application() -> FastAPI:
    expose_docs = not (
        settings.APP_ENV.strip().lower() == "production" and not settings.DEBUG
    )
    app = FastAPI(
        title=settings.APP_NAME,
        version="2.0.0",
        description="RallyOS — Pickleball Game & Tournament Management Platform API",
        docs_url="/docs" if expose_docs else None,
        redoc_url="/redoc" if expose_docs else None,
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json" if expose_docs else None,
        lifespan=lifespan,
    )

    app.add_middleware(GZipMiddleware, minimum_size=500)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_origin_regex=settings.CORS_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        response.headers.setdefault("X-XSS-Protection", "0")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        response.headers.setdefault("X-DNS-Prefetch-Control", "on")
        if request.url.path.startswith(f"{settings.API_V1_PREFIX}/auth"):
            response.headers.setdefault("Cache-Control", "no-store")
        elif "/score" in request.url.path:
            response.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate, private")
        return response

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(
        _request: Request, exc: IntegrityError
    ) -> JSONResponse:
        orig_detail = str(getattr(exc, "orig", exc) or "").strip()
        detail = (
            f"A database constraint conflict occurred: {orig_detail}"
            if orig_detail
            else "A database constraint conflict occurred."
        )
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": detail},
        )

    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["System"],
        summary="Health and database connectivity check",
    )
    def health_check() -> HealthResponse:
        db_ok = db_session.check_database_connection()
        return HealthResponse(
            status="ok" if db_ok else "degraded",
            app=settings.APP_NAME,
            environment=settings.APP_ENV,
            database=db_session.active_db_backend if db_ok else "disconnected",
        )

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)
    return app


app = create_application()
