"""
Seed script for the Deployments Dashboard assignment.
Populates MongoDB with ~5,000 realistic deployment records.

Usage:
    pip install -r requirements.txt
    python seed.py
"""

import random
import uuid
from datetime import datetime, timedelta, timezone

from faker import Faker
from pymongo import MongoClient

fake = Faker()

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "deployments"
COLLECTION_NAME = "deployments"

NUM_DEPLOYMENTS = 5000

STATUSES = ["active", "failed", "stopped"]
STATUS_WEIGHTS = [0.6, 0.15, 0.25]

TYPES = ["web_service", "worker", "cron_job"]
TYPE_WEIGHTS = [0.5, 0.3, 0.2]

ENVIRONMENTS = ["production", "staging", "development"]
ENV_WEIGHTS = [0.4, 0.35, 0.25]

TEAM_NAMES = [
    "payments", "checkout", "identity", "platform", "data-pipeline",
    "notifications", "search", "analytics", "onboarding", "billing",
    "infrastructure", "ml-ops", "content", "marketplace", "security",
]

SERVICE_PREFIXES = [
    "api", "worker", "gateway", "proxy", "scheduler", "processor",
    "indexer", "aggregator", "dispatcher", "monitor", "collector",
    "transformer", "validator", "exporter", "importer",
]

SERVICE_SUFFIXES = [
    "service", "handler", "engine", "daemon", "relay", "bridge",
    "adapter", "connector", "runner", "agent",
]

CREATORS = [fake.email() for _ in range(30)]


def generate_service_name() -> str:
    prefix = random.choice(SERVICE_PREFIXES)
    suffix = random.choice(SERVICE_SUFFIXES)
    domain = random.choice(
        ["auth", "user", "order", "payment", "inventory", "catalog",
         "shipping", "email", "sms", "log", "metric", "event", "cache",
         "session", "config", "feature-flag", "rate-limit", "webhook"]
    )
    patterns = [
        f"{domain}-{prefix}",
        f"{domain}-{suffix}",
        f"{prefix}-{domain}-{suffix}",
        f"{domain}-{prefix}-{suffix}",
    ]
    return random.choice(patterns)


def generate_version() -> str:
    major = random.randint(0, 5)
    minor = random.randint(0, 20)
    patch = random.randint(0, 50)
    return f"{major}.{minor}.{patch}"


def generate_attributes() -> dict:
    attrs = {}

    attrs["name"] = generate_service_name()

    if random.random() < 0.7:
        attrs["description"] = fake.sentence(nb_words=random.randint(4, 12))

    attrs["team"] = random.choice(TEAM_NAMES)

    if random.random() < 0.5:
        attrs["region"] = random.choice(["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"])

    if random.random() < 0.3:
        attrs["language"] = random.choice(["python", "typescript", "go", "java", "rust"])

    if random.random() < 0.2:
        attrs["framework"] = random.choice(["fastapi", "express", "gin", "spring", "actix"])

    if random.random() < 0.4:
        attrs["priority"] = random.choice(["critical", "high", "medium", "low"])

    if random.random() < 0.25:
        attrs["oncall"] = fake.email()

    return attrs


def generate_deployment() -> dict:
    created_at = fake.date_time_between(
        start_date="-2y",
        end_date="now",
        tzinfo=timezone.utc,
    )

    updated_at = created_at + timedelta(
        seconds=random.randint(0, int((datetime.now(timezone.utc) - created_at).total_seconds()))
    )

    deployment = {
        "deployment_id": str(uuid.uuid4()),
        "version": generate_version(),
        "status": random.choices(STATUSES, weights=STATUS_WEIGHTS, k=1)[0],
        "type": random.choices(TYPES, weights=TYPE_WEIGHTS, k=1)[0],
        "environment": random.choices(ENVIRONMENTS, weights=ENV_WEIGHTS, k=1)[0],
        "attributes": generate_attributes(),
        "created_at": created_at,
        "created_by": random.choice(CREATORS),
        "updated_at": updated_at,
        "deleted_at": None,
    }

    return deployment


def main():
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]

    collection.drop()
    print(f"Generating {NUM_DEPLOYMENTS} deployments...")

    deployments = [generate_deployment() for _ in range(NUM_DEPLOYMENTS)]

    collection.insert_many(deployments)
    print(f"Inserted {NUM_DEPLOYMENTS} deployments into {DB_NAME}.{COLLECTION_NAME}")

    collection.create_index("deployment_id", unique=True)
    collection.create_index("created_at")
    collection.create_index("updated_at")
    collection.create_index("status")
    print("Created indexes on deployment_id, created_at, updated_at, status")

    sample = collection.find_one()
    print(f"\nSample record:\n{sample}")

    client.close()


if __name__ == "__main__":
    main()
