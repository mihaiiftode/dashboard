# Deployments Dashboard

A dashboard for browsing, searching, editing, and recovering deployment records. The whole dataset lives in the browser, so filtering, sorting, and grouping never touch the network. Writes go back over HTTP, and other open dashboards pick them up from a change stream.

The original assignment is preserved at [docs/brief.md](docs/brief.md).

## Run it

Everything at once:

```bash
docker compose up -d          # mongo, api on :8000, web on :3000
make seed                     # 5,000 deployments; make seed COUNT=50000 for ten times that
# make seed refuses a non-empty collection; make seed-reset drops it first
open http://localhost:3000
```

If port 3000 is taken, run `WEB_PORT=3002 docker compose up -d` and rebuild the web image, so the browser bundle points at the API it will actually call.

Each side on its own, with Mongo from compose:

```bash
docker compose up -d mongodb
make api                      # uvicorn on :8000, reloading
make web                      # next dev on :3000
```

The running API serves its own documentation: [/docs](http://localhost:8000/docs) for the interactive reference, [/openapi.json](http://localhost:8000/openapi.json) for the schema.

## Environment

Copy `.env.example`. The API reads `API_`-prefixed variables, the browser bundle reads `NEXT_PUBLIC_API_URL` at build time.

| Variable | Default | Why you would change it |
| --- | --- | --- |
| `API_MONGO_URL` | `mongodb://localhost:27017` | Point at another database |
| `API_DATABASE_NAME` | `deployments` | Run two datasets side by side |
| `API_CORS_ORIGINS` | `["http://localhost:3000"]` | Serve the dashboard from another origin |
| `API_CORS_ORIGIN_REGEX` | unset | Match origins whose hostname is not fixed, such as per-deployment preview URLs |
| `API_SEED_ON_STARTUP` | `false` | Fill an empty collection on boot, for environments with no shell to run `make seed` |
| `API_SEED_COUNT` | `5000` | How many deployments that startup seed writes |
| `API_LOG_FORMAT` | `plain` | `json` for structured logs |
| `API_LOG_LEVEL` | `INFO` | `DEBUG` while chasing something |
| `API_HEARTBEAT_SECONDS` | `15` | How often the change stream sends a keep-alive comment |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Where the browser sends writes |
| `WEB_PORT` | `3000` | Publish the web container elsewhere |

## Tests and checks

```bash
make test        # API tests on testcontainers Mongo, web tests in jsdom
make lint        # ruff, ty, oxlint, oxfmt, knip
```

Per side: `make test-api`, `make test-web`, `cd web && pnpm check`.

The API's unit tests mock the repository interface. Anything that needs a real database runs end to end against Mongo in a container, including the compare-and-set on writes and the server-sent event stream against a live uvicorn.

## Searching

One input takes every query. Bare words match anywhere across identifier, version, creator, and every attribute value. Everything else is `key:value`.

| You type | You get |
| --- | --- |
| `payments` | rows carrying that text anywhere |
| `status:failed` | one facet value |
| `status:failed type:worker` | both conditions |
| `-status:failed` | everything except |
| `env:prod` | aliases resolve, so does `environment:production` |
| `name:api-*` | glob against the whole value |
| `created:<2026-09-10` | before that UTC calendar day; use `>` for after |
| `created:2026-09-10` | on that UTC calendar day; `<=` and `>=` include that day |
| `is:deleted` | the trash, with days left per row; `-is:deleted` is the default scope |
| `team:"release team"` | quote a value with a space, comma, or quote |

Queries use [Liqe](https://github.com/gajus/liqe) syntax. Spaces between filters mean `AND`, and a filter prefixed with `-` or `NOT` is negated. Commas are literal characters.

Disjunctions and parenthesised groups are not supported. A clause written with `OR` or parentheses stays in the bar and is marked rather than applied. The deployment adapter handles text, enum, wildcard, and calendar-date filters, but not regex or numeric ranges.

Use `is:deleted` as a separate `AND` clause to select the trash. Table headers and the Fields panel control sorting and grouping, under their own URL parameters.

The suggestion popup counts what each choice would leave given the other filters. For a string field it leads with a matches-anywhere row that Enter never takes, so pressing Enter keeps what you typed. Liqe supplies the token positions behind completion and the chips. Incomplete field values can be completed; other invalid syntax is marked and ignored until corrected. The query lives in the URL, so a search is a link.

## How it works

- The browser holds every deployment in RxDB over IndexedDB and reads it through TanStack DB live queries, so a reload resumes from a checkpoint instead of refetching ([ADR 0001](docs/adr/0001-rxdb-replication-under-tanstack-db.md)).
- Deleted rows stay ordinary documents locally, so the trash scope is a query rather than a second store ([ADR 0002](docs/adr/0002-deleted-deployments-stay-in-the-client-collection.md)).
- Writes are compare-and-set on a monotonic `revision`, which doubles as the ETag. A stale write answers 412 with the winning document, and the client adopts it and says which value survived.
- Every successful write fans out over server-sent events. A dropped connection resyncs from the client's own checkpoint, and the footer says live, reconnecting, or offline.
- The frontend is one feature module with thin routes and a container hook as the only seam to the store ([ADR 0003](docs/adr/0003-feature-module-frontend-architecture.md), [CODING_STANDARDS.md](CODING_STANDARDS.md)).

## Scale limits

- The dataset is held in the browser, so memory and the initial replication bound how big it can get.
- Deleted rows are swept by a TTL index 30 days after deletion.
- The change stream is in-process, so it fans out to clients of one API instance.
