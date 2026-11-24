import math
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowRateLimiter:
    """Thread-safe, bounded-memory sliding-window rate limiter."""

    def __init__(self, max_buckets: int = 10000) -> None:
        self._buckets: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._max_buckets = max_buckets
        self._last_sweep = time.monotonic()

    def clear(self) -> None:
        with self._lock:
            self._buckets.clear()

    def _sweep_stale(self, now: float, window_seconds: int) -> None:
        cutoff = now - window_seconds
        expired_keys = [
            key
            for key, hits in self._buckets.items()
            if not hits or hits[-1] <= cutoff
        ]
        for key in expired_keys:
            self._buckets.pop(key, None)

        if len(self._buckets) > self._max_buckets:
            # Evict oldest least-recently-used keys to bound memory
            sorted_keys = sorted(
                self._buckets.keys(),
                key=lambda k: self._buckets[k][-1] if self._buckets[k] else 0.0,
            )
            excess = len(self._buckets) - self._max_buckets
            for key in sorted_keys[:excess]:
                self._buckets.pop(key, None)

    def check(self, key: str, max_attempts: int, window_seconds: int) -> int | None:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            if (now - self._last_sweep) >= max(10, window_seconds):
                self._sweep_stale(now, window_seconds)
                self._last_sweep = now

            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = deque()
                self._buckets[key] = bucket

            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= max_attempts:
                retry_after = max(1, math.ceil(bucket[0] + window_seconds - now))
                return retry_after

            bucket.append(now)
            return None


auth_rate_limiter = SlidingWindowRateLimiter()


def extract_client_ip(request: Request | None) -> str:
    if request is None:
        return "unknown"
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first_hop = forwarded_for.split(",")[0].strip()
        if first_hop:
            return first_hop
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_auth_rate_limit(
    request: Request,
    scope: str,
    identifier: str = "",
) -> None:
    if not settings.RATE_LIMIT_ENABLED:
        return
    client_ip = extract_client_ip(request)
    ident = identifier.strip().lower()[:64]
    key = f"{scope}:{client_ip}:{ident}" if ident else f"{scope}:{client_ip}"
    retry_after = auth_rate_limiter.check(
        key=key,
        max_attempts=settings.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
        window_seconds=settings.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    )
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Please wait and try again.",
            headers={"Retry-After": str(retry_after)},
        )

