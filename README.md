# Deployments Dashboard

A dashboard for browsing, searching, editing, and recovering deployment records. The whole dataset lives in the browser, so filtering, sorting, and grouping never touch the network; writes go back over HTTP and every other open dashboard hears about them within a second.

The original assignment is preserved at [docs/brief.md](docs/brief.md).

## Run it

Everything at once:

```bash
docker compose up -d          # mongo, api on :8000, web on :3000
make seed                     # 5,000 deployments; make seed COUNT=50000 for ten times that
# make seed refuses a non-empty collection; make seed-reset drops it first
open http://localhost:3000
```

Port 3000 taken? `WEB_PORT=3002 docker compose up -d`, and rebuild the web image so the browser bundle points at the API it will actually call.

Each side on its own, with Mongo from compose:

```bash
docker compose up -d mongodb
make api                      # uvicorn on :8000, reloading
make web                      # next dev on :3000
```

API documentation is served from the running API: [/docs](http://localhost:8000/docs) for the interactive reference, [/openapi.json](http://localhost:8000/openapi.json) for the schema. Every endpoint, parameter, and error response carries a description.

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
make test        # 94 API tests on testcontainers Mongo, 187 web tests in jsdom
make lint        # ruff, ty, oxlint, oxfmt, knip
```

Per side: `make test-api`, `make test-web`, `cd web && pnpm check`.

The API's unit tests mock the repository interface; anything that needs a real database runs end to end against Mongo in a container, including the compare-and-set on writes and the server-sent event stream against a live uvicorn.

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

Queries use [Liqe](https://github.com/gajus/liqe) syntax. Spaces between filters mean `AND`. Prefix a filter with `-` or `NOT` to negate it. Commas are literal characters. Disjunctions and parenthesised groups are not supported: a clause written with `OR` or parentheses stays in the bar and is marked rather than applied. The deployment adapter supports text, enum, wildcard, and calendar-date filters; regex and numeric-range expressions are not supported.

Use `is:deleted` as a separate `AND` clause to select the trash. Sorting and grouping are controlled by table headers and the Fields panel, with separate URL parameters.

The popup counts what each choice would leave given the other filters. For a string field it leads with a matches-anywhere row that Enter never takes, so pressing Enter keeps what you typed. Liqe supplies the token positions used for completion and chips. Incomplete field values can be completed; other invalid syntax is marked and ignored until corrected. The query lives in the URL, so a search is a link.

## How it works

- The browser holds every deployment in RxDB over IndexedDB and reads it through TanStack DB live queries, so a reload resumes from a checkpoint instead of refetching ([ADR 0001](docs/adr/0001-rxdb-replication-under-tanstack-db.md)).
- Deleted rows stay ordinary documents locally so the trash scope is a query, not a second store ([ADR 0002](docs/adr/0002-deleted-deployments-stay-in-the-client-collection.md)).
- Writes are compare-and-set on a monotonic `revision`, which is also the ETag. A stale write answers 412 with the winning document, and the client adopts it and says which value survived.
- Every successful write fans out over server-sent events. A dropped connection resyncs from the client's own checkpoint, and the footer says live, reconnecting, or offline.
- The frontend is one feature module behind a single public barrel, with thin routes and a container hook as the only seam to the store ([ADR 0003](docs/adr/0003-feature-module-frontend-architecture.md), [CODING_STANDARDS.md](CODING_STANDARDS.md)).

## Measured behaviour

Production build, real API, headless Chrome at 1600x900, real key events 90ms apart, latency from Chrome event timing which rounds to 8ms. Typing starts only once replication has settled, so these are steady-state numbers.

| | 5,000 deployments | 50,000 deployments |
| --- | --- | --- |
| Keystroke to paint | 16ms median, 16ms p95 | one settle window, see below |
| Keystroke handler | 2ms median | 2ms median |
| Suggestion computed | 0.002ms median | 0.002ms median |
| List requests while typing | 0 | 0 |

Suggestion counts come from incremental per-field indexes, so they are flat in dataset size. The row list is different: each keystroke changes the filter, and rebuilding a TanStack DB pipeline re-ingests every row, measured at 186ms to 277ms per rebuild at 50,000 rows against 2ms for the same filter as a plain pass. The table therefore updates 120ms after the last keystroke rather than on every one, which keeps the suggestion popup and the token chips at one frame while the row list stays off the typing path. Replacing that pipeline rebuild with a plain filter is the next performance ticket.

## Scale limits

- The dataset is held in the browser, so memory and initial replication bound it. 5,000 rows replicate in a few seconds; 50,000 take a few minutes over pages of 1,000 and roughly 200MB of IndexedDB.
- Above about 50,000 rows the row query needs the plain-filter path described above; suggestions, counts, and coverage already scale.
- Deleted rows are swept by a TTL index 30 days after deletion, and the client hides anything past that window without waiting for the sweep.
- The change stream is in-process, so it fans out to clients of one API instance. More than one instance needs a shared broker.

## Where the requirements landed

| Brief | Where |
| --- | --- |
| Browse thousands efficiently | virtualized table, keyset pull replication |
| Instant search and filtering | one query grammar over local live queries, incremental suggestion counts |
| Ordering and grouping | `sort:` and `group:` directives, header rows per group |
| Coming back without refetching | RxDB checkpoint resume over IndexedDB |
| Inline editing from the list | every cell edits in place, optimistic with a pending indicator |
| Custom attributes | packed attributes column with a validating popover |
| 30 day recovery | soft delete, `is:deleted` scope, restore, TTL index |
| Multiple viewers | server-sent change stream with resync on reconnect |
