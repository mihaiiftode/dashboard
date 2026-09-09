import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Protocol

from app.deployments.models import Deployment

logger = logging.getLogger(__name__)

BACKLOG = 100


class ChangePublisher(Protocol):
    async def publish(self, deployment: Deployment) -> None: ...


class ChangeFeed:
    """Fans every write out to the connected streams of this process."""

    def __init__(self, backlog: int = BACKLOG) -> None:
        self._backlog = backlog
        self._subscribers: set[asyncio.Queue[Deployment]] = set()

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    async def publish(self, deployment: Deployment) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(deployment)
            except asyncio.QueueFull:
                logger.warning(
                    "change feed subscriber is behind, dropping %s",
                    deployment.deployment_id,
                )

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[AsyncIterator[Deployment]]:
        queue: asyncio.Queue[Deployment] = asyncio.Queue(maxsize=self._backlog)
        self._subscribers.add(queue)
        try:
            yield drain(queue)
        finally:
            self._subscribers.discard(queue)


async def drain(queue: asyncio.Queue[Deployment]) -> AsyncIterator[Deployment]:
    while True:
        yield await queue.get()
