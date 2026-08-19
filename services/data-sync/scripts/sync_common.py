"""Shared utilities for GovSource data synchronization jobs."""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, Mapping, Optional, Tuple
from uuid import uuid4

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT: Tuple[float, float] = (10.0, 60.0)
RETRYABLE_STATUS_CODES = (429, 500, 502, 503, 504)


class SyncError(RuntimeError):
    """Base class for errors that must fail a synchronization run."""


class UpstreamAPIError(SyncError):
    """Raised when an upstream response cannot be fetched or validated."""


class ConfigurationError(SyncError):
    """Raised when required runtime configuration is missing."""


@dataclass
class RunStats:
    run_id: str = field(default_factory=lambda: str(uuid4()))
    started_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    fetched: int = 0
    written: int = 0
    skipped: int = 0
    failed: int = 0

    def log(self, job_name: str) -> None:
        summary = asdict(self)
        summary.update(
            {
                "job": job_name,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info("data_sync_summary=%s", json.dumps(summary, sort_keys=True))


class RateLimiter:
    """Simple monotonic-clock limiter for sequential API requests."""

    def __init__(self, minimum_interval_seconds: float) -> None:
        self.minimum_interval_seconds = max(0.0, minimum_interval_seconds)
        self._last_request_at: Optional[float] = None

    def wait(self) -> None:
        now = time.monotonic()
        if self._last_request_at is not None:
            remaining = self.minimum_interval_seconds - (now - self._last_request_at)
            if remaining > 0:
                time.sleep(remaining)
        self._last_request_at = time.monotonic()


def build_http_session(
    *,
    headers: Optional[Mapping[str, str]] = None,
    retries: int = 5,
    backoff_factor: float = 1.0,
) -> requests.Session:
    """Create a pooled GET client with bounded retries and Retry-After support."""
    retry = Retry(
        total=retries,
        connect=retries,
        read=retries,
        status=retries,
        backoff_factor=backoff_factor,
        status_forcelist=RETRYABLE_STATUS_CODES,
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    adapter = HTTPAdapter(
        max_retries=retry,  # type: ignore[arg-type]
        pool_connections=10,
        pool_maxsize=10,
    )
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    if headers:
        session.headers.update(headers)
    session.headers.setdefault("User-Agent", "govsource-data-sync/1.0")
    return session


def get_json(
    session: requests.Session,
    url: str,
    *,
    params: Optional[Mapping[str, Any]] = None,
    timeout: Tuple[float, float] = DEFAULT_TIMEOUT,
    rate_limiter: Optional[RateLimiter] = None,
) -> Dict[str, Any]:
    """Fetch a JSON object or raise a failure distinguishable from an empty page."""
    if rate_limiter:
        rate_limiter.wait()
    try:
        response = session.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise UpstreamAPIError(f"Failed to fetch {url}: {exc}") from exc
    if not isinstance(payload, dict):
        raise UpstreamAPIError(f"Expected a JSON object from {url}")
    return payload


def iter_paginated_items(
    session: requests.Session,
    url: str,
    item_key: str,
    *,
    params: Optional[Mapping[str, Any]] = None,
    max_pages: Optional[int] = None,
    rate_limiter: Optional[RateLimiter] = None,
) -> Iterator[Dict[str, Any]]:
    """Yield items while following the standard ``pagination.next`` contract."""
    next_url: Optional[str] = url
    next_params: Optional[Mapping[str, Any]] = params
    page = 0
    while next_url and (max_pages is None or page < max_pages):
        payload = get_json(
            session,
            next_url,
            params=next_params,
            rate_limiter=rate_limiter,
        )
        items = payload.get(item_key, [])
        if not isinstance(items, list):
            raise UpstreamAPIError(
                f"Expected '{item_key}' to be a list from {next_url}"
            )
        for item in items:
            if isinstance(item, dict):
                yield item
        pagination = payload.get("pagination") or {}
        next_url = pagination.get("next") if isinstance(pagination, dict) else None
        next_params = None
        page += 1


def iter_next_paginated_items(
    session: requests.Session,
    url: str,
    item_key: str,
    *,
    params: Optional[Mapping[str, Any]] = None,
    max_pages: Optional[int] = None,
    rate_limiter: Optional[RateLimiter] = None,
) -> Iterator[Dict[str, Any]]:
    """Yield items for APIs that expose a top-level ``next`` URL."""
    next_url: Optional[str] = url
    next_params: Optional[Mapping[str, Any]] = params
    page = 0
    while next_url and (max_pages is None or page < max_pages):
        payload = get_json(
            session,
            next_url,
            params=next_params,
            rate_limiter=rate_limiter,
        )
        items = payload.get(item_key, [])
        if not isinstance(items, list):
            raise UpstreamAPIError(
                f"Expected '{item_key}' to be a list from {next_url}"
            )
        for item in items:
            if isinstance(item, dict):
                yield item
        candidate = payload.get("next")
        next_url = candidate if isinstance(candidate, str) and candidate else None
        next_params = None
        page += 1


def require_env(name: str, *fallback_names: str) -> str:
    for candidate in (name, *fallback_names):
        value = os.getenv(candidate)
        if value:
            if candidate != name:
                logger.warning("%s is deprecated; use %s", candidate, name)
            return value
    choices = ", ".join((name, *fallback_names))
    raise ConfigurationError(f"Missing required environment variable ({choices})")


def create_supabase_client() -> Any:
    """Create a server-only Supabase client without resolving config at import time."""
    from supabase import create_client

    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY")
    return create_client(url, key)


def upsert_preserving_missing(
    supabase: Any,
    table: str,
    row: Mapping[str, Any],
    conflict_column: str,
    *,
    id_column: str = "id",
) -> Any:
    """Insert a row or patch an existing row without nulling omitted columns."""
    conflict_value = row.get(conflict_column)
    if conflict_value is None:
        raise ValueError(f"Missing conflict column '{conflict_column}'")

    existing = (
        supabase.table(table)
        .select(id_column)
        .eq(conflict_column, conflict_value)
        .limit(1)
        .execute()
    )
    if existing.data:
        record_id = existing.data[0][id_column]
        return (
            supabase.table(table).update(dict(row)).eq(id_column, record_id).execute()
        )
    return supabase.table(table).insert(dict(row)).execute()


def upload_bytes(
    supabase: Any,
    bucket: str,
    path: str,
    content: bytes,
    content_type: str,
) -> str:
    """Idempotently upload an object and return its path only after success."""
    supabase.storage.from_(bucket).upload(
        path=path,
        file=content,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return path
