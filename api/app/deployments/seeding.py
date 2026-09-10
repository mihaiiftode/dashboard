import logging
import random
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.deployments.mongo_repository import COLLECTION_NAME

logger = logging.getLogger(__name__)

SEED_LOCK_COLLECTION = "seed_lock"
SEED_LOCK_ID = "deployments"
INSERT_BATCH = 1000
CREATION_WINDOW = timedelta(days=730)

STATUSES = ["active", "failed", "stopped"]
STATUS_WEIGHTS = [0.6, 0.15, 0.25]

TYPES = ["web_service", "worker", "cron_job"]
TYPE_WEIGHTS = [0.5, 0.3, 0.2]

ENVIRONMENTS = ["production", "staging", "development"]
ENV_WEIGHTS = [0.4, 0.35, 0.25]

TEAMS = [
    "payments",
    "checkout",
    "identity",
    "platform",
    "data-pipeline",
    "notifications",
    "search",
    "analytics",
    "onboarding",
    "billing",
    "infrastructure",
    "ml-ops",
    "content",
    "marketplace",
    "security",
]

SERVICE_PREFIXES = [
    "api",
    "worker",
    "gateway",
    "proxy",
    "scheduler",
    "processor",
    "indexer",
    "aggregator",
    "dispatcher",
    "monitor",
    "collector",
    "transformer",
    "validator",
    "exporter",
    "importer",
]

SERVICE_SUFFIXES = [
    "service",
    "handler",
    "engine",
    "daemon",
    "relay",
    "bridge",
    "adapter",
    "connector",
    "runner",
    "agent",
]

DOMAINS = [
    "auth",
    "user",
    "order",
    "payment",
    "inventory",
    "catalog",
    "shipping",
    "email",
    "sms",
    "log",
    "metric",
    "event",
    "cache",
    "session",
    "config",
    "feature-flag",
    "rate-limit",
    "webhook",
]

REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]
LANGUAGES = ["python", "typescript", "go", "java", "rust"]
FRAMEWORKS = ["fastapi", "express", "gin", "spring", "actix"]
PRIORITIES = ["critical", "high", "medium", "low"]

GIVEN_NAMES = [
    "ana",
    "bogdan",
    "carla",
    "dmitri",
    "elena",
    "farid",
    "grace",
    "hugo",
    "iris",
    "jonas",
    "kira",
    "lucas",
    "maya",
    "nils",
    "olga",
    "pablo",
]
FAMILY_NAMES = [
    "adams",
    "bauer",
    "costa",
    "dubois",
    "eriksen",
    "fischer",
    "garcia",
    "hansen",
    "ivanov",
    "jensen",
    "kovacs",
    "lindqvist",
    "moreau",
    "novak",
]
MAIL_DOMAINS = ["example.com", "example.org", "example.net"]

SENTENCE_WORDS = [
    "rolls",
    "handles",
    "queues",
    "retries",
    "batches",
    "streams",
    "indexes",
    "traffic",
    "requests",
    "records",
    "events",
    "payloads",
    "jobs",
    "shards",
    "nightly",
    "hourly",
    "per-tenant",
    "read-only",
    "canary",
    "blue-green",
]


def email() -> str:
    return (
        f"{random.choice(GIVEN_NAMES)}.{random.choice(FAMILY_NAMES)}"
        f"@{random.choice(MAIL_DOMAINS)}"
    )


def sentence() -> str:
    words = random.sample(SENTENCE_WORDS, k=random.randint(4, 10))
    return " ".join(words).capitalize() + "."


def service_name() -> str:
    domain = random.choice(DOMAINS)
    prefix = random.choice(SERVICE_PREFIXES)
    suffix = random.choice(SERVICE_SUFFIXES)
    return random.choice(
        [
            f"{domain}-{prefix}",
            f"{domain}-{suffix}",
            f"{prefix}-{domain}-{suffix}",
            f"{domain}-{prefix}-{suffix}",
        ]
    )


def version() -> str:
    return f"{random.randint(0, 5)}.{random.randint(0, 20)}.{random.randint(0, 50)}"


def attributes(creators: list[str]) -> dict[str, str]:
    values = {"name": service_name(), "team": random.choice(TEAMS)}
    if random.random() < 0.7:
        values["description"] = sentence()
    if random.random() < 0.5:
        values["region"] = random.choice(REGIONS)
    if random.random() < 0.3:
        values["language"] = random.choice(LANGUAGES)
    if random.random() < 0.2:
        values["framework"] = random.choice(FRAMEWORKS)
    if random.random() < 0.4:
        values["priority"] = random.choice(PRIORITIES)
    if random.random() < 0.25:
        values["oncall"] = random.choice(creators)
    return values


def deployment(now: datetime, creators: list[str]) -> dict[str, Any]:
    created_at = now - CREATION_WINDOW * random.random()
    updated_at = created_at + (now - created_at) * random.random()
    return {
        "deployment_id": str(uuid.uuid4()),
        "revision": 1,
        "version": version(),
        "status": random.choices(STATUSES, weights=STATUS_WEIGHTS)[0],
        "type": random.choices(TYPES, weights=TYPE_WEIGHTS)[0],
        "environment": random.choices(ENVIRONMENTS, weights=ENV_WEIGHTS)[0],
        "attributes": attributes(creators),
        "created_at": created_at,
        "created_by": random.choice(creators),
        "updated_at": updated_at,
        "deleted_at": None,
    }


async def claimed_by_this_instance(database: AsyncDatabase) -> bool:
    """A unique _id makes the first writer across concurrent cold starts the only seeder."""
    try:
        await database.get_collection(SEED_LOCK_COLLECTION).insert_one(
            {"_id": SEED_LOCK_ID, "claimed_at": datetime.now(UTC)}
        )
    except DuplicateKeyError:
        return False
    return True


async def seed_if_empty(database: AsyncDatabase, count: int) -> None:
    collection = database.get_collection(COLLECTION_NAME)
    if await collection.estimated_document_count():
        return
    if not await claimed_by_this_instance(database):
        return
    now = datetime.now(UTC)
    creators = [email() for _ in range(30)]
    for start in range(0, count, INSERT_BATCH):
        size = min(INSERT_BATCH, count - start)
        await collection.insert_many([deployment(now, creators) for _ in range(size)])
    logger.info("seeded %s deployments", count)
