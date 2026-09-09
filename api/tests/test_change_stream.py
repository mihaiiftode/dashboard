import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from pymongo.asynchronous.database import AsyncDatabase
from uvicorn import Config, Server

from app.deployments.change_feed import ChangeFeed
from app.deployments.models import Deployment
from app.deployments.router import frames
from app.main import create_app
from app.settings import Settings
from tests.conftest import store

pytestmark = pytest.mark.anyio

BASE = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)


def deployment(deployment_id: UUID, name: str = "service-a") -> Deployment:
    return Deployment.model_validate(
        {
            "deployment_id": str(deployment_id),
            "revision": 2,
            "version": "1.0.0",
            "status": "active",
            "type": "worker",
            "environment": "staging",
            "attributes": {"name": name},
            "created_at": BASE.isoformat(),
            "created_by": "engineer@example.com",
            "updated_at": BASE.isoformat(),
            "deleted_at": None,
        }
    )


async def test_hands_a_change_to_every_open_stream() -> None:
    feed = ChangeFeed()
    changed = deployment(uuid4())

    async with feed.subscribe() as first, feed.subscribe() as second:
        await feed.publish(changed)

        seen = await asyncio.gather(anext(first), anext(second))

    assert [row.deployment_id for row in seen] == [changed.deployment_id] * 2


async def test_forgets_a_stream_once_it_closes() -> None:
    feed = ChangeFeed()

    async with feed.subscribe():
        assert feed.subscriber_count == 1

    assert feed.subscriber_count == 0


async def test_drops_a_change_a_stream_is_too_far_behind_to_take() -> None:
    feed = ChangeFeed(backlog=1)
    first, second = deployment(uuid4(), "first"), deployment(uuid4(), "second")

    async with feed.subscribe() as changes:
        await feed.publish(first)
        await feed.publish(second)

        assert (await anext(changes)).attributes.name == "first"
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(anext(changes), timeout=0.05)


async def test_frames_carry_the_document_and_the_checkpoint_to_resume_from() -> None:
    feed = ChangeFeed()
    changed = deployment(uuid4())
    stream = frames(feed)
    published = asyncio.create_task(publish_soon(feed, changed))
    try:
        event = json.loads(await asyncio.wait_for(anext(stream), timeout=5))
    finally:
        await published
        await stream.aclose()

    assert [item["deployment_id"] for item in event["documents"]] == [
        str(changed.deployment_id)
    ]
    assert event["checkpoint"] == {
        "updated_at": changed.updated_at.isoformat().replace("+00:00", "Z"),
        "deployment_id": str(changed.deployment_id),
    }


async def publish_soon(feed: ChangeFeed, changed: Deployment) -> None:
    for _ in range(50):
        await asyncio.sleep(0.01)
        if feed.subscriber_count:
            await feed.publish(changed)
            return
    raise AssertionError("no stream subscribed")


@pytest.fixture
async def live_api(
    scratch_settings: Settings, database: AsyncDatabase
) -> AsyncIterator[str]:
    stored = deployment(uuid4(), "before")
    await store(database, [stored])
    config = Config(
        create_app(scratch_settings.model_copy(update={"heartbeat_seconds": 0.05})),
        host="127.0.0.1",
        port=0,
        log_level="warning",
    )
    server = Server(config)
    serving = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)
    port = server.servers[0].sockets[0].getsockname()[1]
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    await serving


async def test_streams_a_write_to_a_connected_client(live_api: str) -> None:
    async with AsyncClient(base_url=live_api, timeout=10) as http:
        rows = (await http.get("/v1/deployments")).json()["items"]
        target = rows[0]["deployment_id"]
        async with http.stream("GET", "/v1/deployments/events") as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")
            lines = response.aiter_lines()
            written = await http.put(
                f"/v1/deployments/{target}",
                json={
                    "version": "2.0.0",
                    "status": "failed",
                    "type": "cron_job",
                    "environment": "production",
                    "attributes": {"name": "streamed"},
                },
            )
            assert written.status_code == 200

            event = json.loads(await asyncio.wait_for(next_data(lines), timeout=5))

    assert [item["attributes"]["name"] for item in event["documents"]] == ["streamed"]
    assert event["checkpoint"]["deployment_id"] == target


async def next_data(lines: AsyncIterator[str]) -> str:
    async for line in lines:
        if line.startswith("data: "):
            return line.removeprefix("data: ")
    raise AssertionError("the stream closed without an event")
