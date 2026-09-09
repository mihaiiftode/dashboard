# Coding Standards

Applies to `api/` and `web/`. Reviews cite these rules by heading.

## Working rules

- State assumptions before coding. Two readings of a task means ask, not pick.
- Minimum code that solves the stated problem. No speculative flexibility, configuration, or abstraction for single-use code.
- Touch only what the task needs. Match surrounding style. Mention unrelated dead code, never delete it unprompted.
- Every task has a verifiable success criterion before implementation starts.
- KISS over cleverness. DRY at the second real duplication, never the first.
- No comments. Names, extraction, and types carry the why. Machine-read lines stay: shebang, pragma, lint and type directives.

## Module size and layout

- One file, one responsibility. Split when a file gains a second reason to change.
- Small, not tiny. A file under roughly thirty lines merges into its neighbour unless it is a real seam with two adapters.
- Folder structure follows the layers already agreed: `api/app/deployments/{router,service,repository,feed,models}.py`, `web/src/{app,features/deployments,lib/data,lib/api,lib/schemas.ts}`. New concerns get a sibling, not a new hierarchy.

## Backend (FastAPI)

- Classes for anything with state or a seam: services, repositories, the change feed, settings. Route handlers stay as FastAPI functions and delegate immediately to a service method.
- Dependencies are constructed once in the lifespan and injected with `Depends`. No module-level singletons, no clients built inside handlers.
- Domain errors are exceptions raised by the service: `NotFound`, `Conflict`, `InvalidAttribute`. One `errors.py` maps them, Pydantic validation errors, and the unexpected catch-all to RFC 9457 problem+json. Handlers never build error responses by hand.
- Logging via `logging.getLogger(__name__)` per module, configured once at startup. JSON lines when `LOG_FORMAT=json`, plain otherwise. Log every write at INFO with the deployment ID, conflicts at WARNING, unexpected failures at ERROR with traceback. No `print`.
- Full type hints. `ruff` for lint and format, `ty check` clean.

## Frontend (Next.js)

- Classes where an object has state or fills a seam: the API client, the store. Components and hooks stay functions.
- One `ApiError` type parsed from problem+json in the API adapter. Features never inspect raw responses.
- One error boundary per feature root. User-facing failures go through a single `notify` module. Replication failures and conflicts surface through `useSyncStatus`, never through ad hoc state.
- One `logger` module built on LogTape with levels and sinks. Nothing below warn is emitted in production. No stray `console.log`.
- Environment variables read through T3 Env, never `process.env` directly.
- TypeScript strict, no `any`, no non-null assertions outside tests. Oxlint and Oxfmt clean, Knip reports no unused files or dependencies.

## UI

- shadcn/ui components on Base UI primitives, Tailwind v4, lucide icons, Base UI toast through the shadcn toast component, next-themes for the theme toggle. TanStack Table v9 with the feature-based API, TanStack Virtual for rows. No second component library, no sonner.
- One table, one query bar, one Fields panel. No facet controls, no detail sheet or route, no separate deleted view, no row menu.
- The query grammar, field schema, resolver, and suggester form one module with no React imports. Components consume its parsed result. Query state lives in the URL as a single `q` parameter.
- Fields: fixed fields plus every Attribute key. Default columns are the fixed fields and Attributes present on at least a third of rows. Chip Fields render as hash-coloured chips, other Attributes as text. Remaining Attributes collapse into one Attributes column with packed chips, an overflow badge, and a popover editor with the key rule enforced inline.
- Inline edit on every cell: the whole cell is the click target, text cells edit with an input, Chip Fields with an autocomplete over existing values. Enter saves, Escape cancels, blur saves. Pending state per row until synced. A conflict reverts the cell and toasts the winning value. Deleted rows are read only.
- Delete and restore are one icon per row. Both toast with an idempotent Undo. The deleted scope shows a Deleted column with relative time and days left.
- Table: fixed row height, sticky header, `aria-sort` on headers, horizontal scroll rather than wrapping. Grouping works on any Field, groups stay expanded, the grouped column keeps its position.
- Shell: header is brand plus theme toggle. Footer carries the row window, the matched count in an aria-live region, the total when filtered, and the sync indicator. Skip link present.
- States: skeleton rows while hydrating from IndexedDB, empty state with a clear-query action, error boundary with retry per feature root.
- Accessibility: WCAG AA contrast in both themes, every control keyboard reachable, visible focus, `/` focuses the query bar, toasts in an aria-live region, `prefers-reduced-motion` respected, semantic table markup preserved under virtualization.
- Performance: keystroke to paint under 16ms in a production build at the seeded dataset and at ten times it. Filtering, sorting, grouping, and suggestion counts are incremental structures maintained by the store, never a full pass per keystroke. The query engine has no DOM or React dependency so it can move to a Worker when measurement demands it.
- Base UI conventions: `data-icon` on icons inside Button, `nativeButton={false}` when a Button renders a Link, items inside `DropdownMenuGroup`, `Field` plus `FieldError` for form rows, no sizing classes on icons inside components.
- No charts.

## Tests

- One test per stated behaviour. No tests for getters, pass-throughs, or framework wiring.
- Tests cross a module's interface. Service tests use the in-memory repository. Repository contract tests run once, parametrised over the Mongo adapter on testcontainers and the in-memory adapter. Router tests use ASGI transport over the real service and the fake repository. Store tests on the client use the fake API adapter.
- Component tests render a feature root over the store backed by the fake API adapter, with React Testing Library. They assert what a user sees and does: rows, edits, toasts, restores. No snapshot tests, no tests of styling.
- No mock-was-called assertions. Assert on results and state.
- A test that could not fail for a plausible bug does not get written.
