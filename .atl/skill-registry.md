# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

Scope note: this pass indexes the 9 skills installed for this project (`state.skills.installed` in `.jr-orchestrator-state.json`), all symlinked at `~/.claude/skills/<name>` -> `~/.agents/skills/<name>`. Generic orchestration/meta skills (`jr-orchestrator`, `find-skill`, `kb-creator`, `roadmap-generator`, `agent-instruction`, `skill-creator`, `sdd-*`, `_shared`) are intentionally excluded — they are workflow skills, not stack/domain skills for sub-agents to apply.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| Creating a component library, implementing a design system, or standardizing UI patterns with Tailwind CSS v4 | tailwind-design-system | `C:\Users\Nicolas\.agents\skills\tailwind-design-system\SKILL.md` |
| Building new FastAPI applications or setting up backend API projects (structure, DI, async, testing) | fastapi-templates | `C:\Users\Nicolas\.agents\skills\fastapi-templates\SKILL.md` |
| Handling concurrent requests / async operations in FastAPI (I/O, WebSockets, SSE, streaming, background tasks) | fastapi-async-patterns | `C:\Users\Nicolas\.agents\skills\fastapi-async-patterns\SKILL.md` |
| Writing, reviewing, or refactoring SQLAlchemy models, Alembic migrations, or DB query patterns | sqlalchemy-alembic-expert-best-practices-code-review | `C:\Users\Nicolas\.agents\skills\sqlalchemy-alembic-expert-best-practices-code-review\SKILL.md` |
| Complex Pydantic data modeling — constraints, validators, model hierarchies, subclasses | pydantic | `C:\Users\Nicolas\.agents\skills\pydantic\SKILL.md` |
| Auth review, session security, CSRF protection, authentication audit | auth-security-reviewer | `C:\Users\Nicolas\.agents\skills\auth-security-reviewer\SKILL.md` |
| Setting up request quota management / preventing brute force, credential stuffing, resource exhaustion against APIs | implementing-api-rate-limiting-and-throttling | `C:\Users\Nicolas\.agents\skills\implementing-api-rate-limiting-and-throttling\SKILL.md` |
| Automating document/workflow pipelines with n8n (triggers, integrations, templates) | n8n-workflow | `C:\Users\Nicolas\.agents\skills\n8n-workflow\SKILL.md` |
| Writing, reviewing, or refactoring Zustand stores — selectors, re-renders, middleware, SSR | zustand | `C:\Users\Nicolas\.agents\skills\zustand\SKILL.md` |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### tailwind-design-system
- Tailwind v4: configure via `@theme` in CSS, not `tailwind.config.ts`; use `@import "tailwindcss"` not `@tailwind base/components/utilities`
- Dark mode: `@custom-variant dark (&:where(.dark, .dark *));` + a `.dark { --color-*: ... }` override block — not JS `darkMode: "class"`
- Define semantic color tokens with OKLCH under `@theme` (`--color-background`, `--color-primary`, `--color-border`, etc.), never raw hex scattered in components
- Token hierarchy: brand tokens (abstract) -> semantic tokens (purpose) -> component tokens (specific)
- Component structure: Base styles -> Variants -> Sizes -> States -> Overrides
- Animations: define `@keyframes` inside `@theme` and reference via `--animate-*` vars
- For deeper worked examples beyond this summary, read `references/details.md` in the skill directory

### fastapi-templates
- Layout: `app/api/v1/endpoints/`, `app/core/{config,security,database}.py`, `app/models/`, `app/schemas/`, `app/services/`, `app/repositories/`, `app/main.py`
- Use `Depends` for DB sessions, auth/authz, shared business logic, and config injection — don't hand-roll DI
- Keep route handlers, DB ops, background tasks, and middleware async end-to-end
- Tests: async fixtures using `httpx.AsyncClient` + `sqlite+aiosqlite:///:memory:`, override `get_db` via `app.dependency_overrides`
- For deeper implementation patterns, read `references/details.md` (section `## Implementation Patterns`) in the skill directory

### fastapi-async-patterns
- Use `async def` only for I/O-bound work (DB, HTTP, files); CPU-bound work stays sync (blocks the event loop otherwise)
- Never call blocking APIs inside async functions (`time.sleep`, `requests`) — use `asyncio.sleep`, `httpx.AsyncClient`
- Always set timeouts on external calls; unbounded awaits can hang the whole server
- Use `asyncio.gather` to parallelize independent queries/API calls instead of awaiting sequentially
- Use connection pools (SQLAlchemy async engine, asyncpg pool, httpx client) and close them via lifespan/`try/finally`, not per-request
- `BackgroundTasks` for fire-and-forget; make sure they can't accumulate/leak or swallow errors silently
- `StreamingResponse` for large files/generated content; `EventSourceResponse` (sse-starlette) for SSE; validate auth before `websocket.accept()`, close with code 1008 on failure

### sqlalchemy-alembic-expert-best-practices-code-review
- Index create/drop: always `postgresql_concurrently=True` inside an autocommit block — never a plain blocking `CREATE INDEX` on a live table
- Unique constraints: create the concurrent unique index first, then add the constraint as a separate migration step
- Foreign keys: add with `NOT VALID` first, validate (`VALIDATE CONSTRAINT`) in a later migration step to avoid long locks
- Check constraints: same NOT VALID-then-validate two-step pattern
- Column type changes: use a multi-step migration (add new column, backfill, swap) to avoid table-wide locks
- Limit non-unique indexes to at most 3 columns; don't add an index already covered by an existing composite index
- Verify every SQLAlchemy query pattern (`.where(...)`, joins) has a matching index defined
- Detailed rationale + before/after code per rule lives in `rules/<rule-name>.md` in the skill directory

### pydantic
- Use `BaseModel` for external/untrusted data (API request/response schemas) only — use plain classes/dataclasses for internal app objects
- Prefer built-in `Field()`/`Annotated` constraints (`Gt`, `StringConstraints`, etc.) over custom `@field_validator` where a constraint already exists
- Prefer the annotated pattern `Annotated[int, Field(...)]` over the assignment form, except `alias`/`default`/`default_factory` which need the assignment form for static-type-checker support
- Field-specific metadata (`deprecated`, `alias`) must sit on the outermost annotated type, not inside one member of a union
- Prefer `mode='after'` validators over `mode='before'` — after-validators get the already-coerced type; before-validators can receive anything
- Avoid `int | str`-style unions meant only for coercion, and avoid abstract collection types (`collections.abc.Sequence`) — both are inefficient/ambiguous
- Don't use `from __future__ import annotations` in modules with Pydantic models; only quote genuine forward references
- Recursive type aliases: use `type X = ...` (Py>=3.12) or `TypeAliasType`, not a quoted `TypeAlias` string
- For model hierarchies, don't type a field as the base class and assign a subclass instance (serializes only base fields, losing data) — use a discriminated union (`Literal['type']` + `Field(discriminator=...)`) or generics instead

### auth-security-reviewer
- Sessions: `httpOnly` + `secure` + `sameSite=strict` cookies, short `maxAge` (~24h), non-default cookie name, secret from env, server-side store (Redis/DB) — never `saveUninitialized`/`resave: true`
- Regenerate the session ID on login and on any privilege escalation (prevents session fixation)
- JWT: strong secret from env, short-lived access token (~15min) + separate refresh token (~7d, stored server-side); never put the access token in `localStorage` (XSS) — use an httpOnly cookie
- CSRF-protect every state-changing (POST/PUT/PATCH/DELETE) route
- Passwords: bcrypt (cost ~12) only, never MD5/SHA1; enforce length/complexity; ideally check against breached-password lists
- Authorization: verify resource ownership on every endpoint (prevent IDOR) — never trust a caller-supplied ID alone
- Rate-limit auth endpoints specifically (login ~5/15min/IP, password reset ~3/hour), independent of general API limits
- MFA (TOTP) for sensitive operations; audit-log authentication events
- **Governance: CRITICAL domain** — per this project's Auth/Security governance level, this skill produces analysis and findings only; no code changes without explicit human approval

### implementing-api-rate-limiting-and-throttling
- Rate-limit auth endpoints most strictly and separately from general API limits (login ~5/min/IP, register ~3/5min/IP, password reset ~3/hour/IP)
- Prefer sliding-window (Redis sorted sets, `ZADD`/`ZREMRANGEBYSCORE`) over fixed-window (avoids boundary-burst); token bucket if controlled bursts are desired
- Use Redis + a Lua script for atomic check-and-increment so limits hold across multiple app instances — in-memory counters break under horizontal scaling
- Always return HTTP 429 with a `Retry-After` header when blocked, and `X-RateLimit-Limit/Remaining/Reset` headers on every response (not just blocked ones)
- Tier limits by user plan and by endpoint cost (search/export/bulk endpoints get lower limits than default reads)
- Decide and document the Redis-unreachable fallback behavior explicitly (commonly fail-open) — don't leave it implicit
- Rate limiting is a defense-in-depth layer, not a substitute for authN/authZ
- Validate client IP (`X-Forwarded-For`) against the real proxy/load balancer — don't trust it blindly for per-IP keys

### n8n-workflow
- Workflow model is node-based: Trigger -> Action(s) -> Output, data flows between nodes
- Node categories: Triggers (Webhook/Schedule/File Watcher), Document, Transform (Code/Set/Merge), Output (Email/Slack/Drive)
- Prefer adapting an existing template over building a workflow from scratch (7800+ templates available)
- Add explicit error-handling nodes; test with sample data before wiring to production
- Store credentials via n8n's built-in credential manager — never hardcode credentials in node parameters
- Self-hosted (`docker run n8nio/n8n`, port 5678) trades maintenance burden for control/data-privacy vs. n8n Cloud
- Project-specific: this project's FastAPI bridge triggers WASA scans that n8n already orchestrates — treat n8n as the existing scan-orchestration layer to call into, not something to rebuild

### zustand
- Use multiple small, feature/domain-scoped stores instead of one monolithic store
- Separate actions from state in a dedicated namespace; name actions as events (`userLoggedIn`) not setters (`setUser`); colocate actions with the state they modify
- Never store derived/computed values in state — derive them in selectors instead
- Always subscribe via a selector (`useStore(s => s.value)`), never subscribe to the whole store; export custom hooks wrapping selectors, not the raw store
- Use atomic selectors for single values; use `useShallow` for multi-property picks to avoid re-renders from new object identity
- Never mutate state directly; use the functional `set(state => ...)` form when updating from previous state; batch related updates into a single `set()` call
- `set()` does a shallow merge only — nested/deep updates need explicit spreading or the `immer` middleware
- SSR: use `skipHydration` + manual rehydrate on client mount to avoid hydration mismatches; guard any `window` access with `typeof window !== 'undefined'`
- `persist` middleware: use `partialize` to persist only needed slices, and version + migrate persisted state when its shape changes

## Project Conventions

No `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, or `copilot-instructions.md` exist at the project root yet. This is expected: the `agent-instruction` phase (next in the `jr-orchestrator` foundation flow) generates the canonical `CLAUDE.md`/`AGENTS.md` from `knowledge-base/` + `CHANGES.md`. Once generated, re-run this skill to populate this section with the extracted conventions and their paths.

Existing project artifacts relevant to conventions (not convention files themselves, but source material the next phase will draw from):

| File | Path | Notes |
|------|------|-------|
| Knowledge base index | `knowledge-base/README.md` | Entry point to 10 canonical KB docs (stack, roles, data model, business rules, architecture, etc.) |
| Roadmap | `CHANGES.md` | Operational index of all 26 OpenSpec changes (CHANGE-00a..CHANGE-22) |

Read the convention files listed above once they exist for project-specific patterns and rules.
