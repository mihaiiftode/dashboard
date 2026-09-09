.PHONY: up down api web seed test test-api test-web lint

up:
	docker compose up --build -d

down:
	docker compose down

api:
	cd api && uv run uvicorn app.main:create_app --factory --reload --port 8000

web:
	cd web && pnpm dev

seed:
	cd seed && uv run --with-requirements requirements.txt python seed.py $(COUNT)

test: test-api test-web

test-api:
	cd api && uv run pytest -q

test-web:
	cd web && pnpm test

lint:
	cd api && uv run ruff check . && uv run ruff format --check . && uv run ty check
	cd web && pnpm typecheck && pnpm lint && pnpm format:check && pnpm knip
