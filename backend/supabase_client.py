import os
import time
from typing import Callable, TypeVar

import httpx
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError("Supabase URL and key are required.")

T = TypeVar("T")


def create_supabase_client() -> Client:
    # Avoid reusing stale pooled connections, which can surface as
    # httpx.RemoteProtocolError: Server disconnected.
    http_client = httpx.Client(
        timeout=httpx.Timeout(30.0, connect=10.0),
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=0),
        http2=False,
    )
    options = SyncClientOptions(
        postgrest_client_timeout=30,
        storage_client_timeout=30,
        httpx_client=http_client,
    )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY, options=options)


def is_transient_supabase_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(
        term in message
        for term in (
            "server disconnected",
            "connection reset",
            "connection aborted",
            "remoteprotocolerror",
            "timeout",
            "temporarily unavailable",
        )
    )


def run_with_supabase_retry(operation: Callable[[Client], T], attempts: int = 2) -> T:
    last_error: Exception | None = None
    for attempt in range(attempts):
        client = supabase if attempt == 0 else create_supabase_client()
        try:
            return operation(client)
        except Exception as error:
            last_error = error
            if not is_transient_supabase_error(error) or attempt == attempts - 1:
                raise
            time.sleep(0.25 * (attempt + 1))
    assert last_error is not None
    raise last_error


supabase: Client = create_supabase_client()
