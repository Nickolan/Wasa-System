# Modelo de Datos

## Dominios

- **Auth** (nuevo, propiedad del FastAPI Bridge): usuarios del SaaS. Una sola entidad: `users`.
- **Scan** (existente, WASA — solo referencia, NO se modifica desde este proyecto): `scans` y `vulnerabilities`.

Ambos dominios conviven en la **misma instancia PostgreSQL `db_fuzzing`**, sin relación de claves foráneas entre `users` y las tablas de escaneo — conviven en el esquema pero son independientes a nivel de dominio.

## ERD (Entity Relationship Diagram)

```
PostgreSQL db_fuzzing
┌─────────────────────┐        ┌─────────────────────┐        ┌───────────────────────────┐
│ users (NUEVA)       │        │ scans (existente)   │ 1    N │ vulnerabilities (existente)│
├─────────────────────┤        ├─────────────────────┤◄───────┤───────────────────────────┤
│ id PK               │        │ id PK               │        │ id PK                     │
│ email UNIQUE NN     │        │ target_url          │        │ scan_id FK → scans.id      │
│ hashed_password NN  │        │ scan_date           │        │ source                    │
│ created_at          │        │ zap_count           │        │ type                      │
└─────────────────────┘        │ nuclei_count        │        │ severity                  │
   (sin FK a scans)            │ ffuf_count           │        │ url                       │
                                │ sqlmap_count         │        │ description               │
                                └─────────────────────┘        │ solution                  │
                                                                │ cweid                     │
                                                                │ evidence                  │
                                                                └───────────────────────────┘
```

## Entidades

### users (NUEVA — creada por el FastAPI Bridge)

- Atributos:
  - `id`: SERIAL, PK, autoincremental.
  - `email`: TEXT, UNIQUE, NOT NULL — normalizado a lowercase antes de guardar.
  - `hashed_password`: TEXT, NOT NULL — hash bcrypt (passlib, rounds=12). El texto plano NUNCA se persiste.
  - `created_at`: TIMESTAMP, DEFAULT CURRENT_TIMESTAMP.
- Relaciones: ninguna (no tiene FK ni es referenciada por otras tablas).
- Constraints: `email` UNIQUE.
- Índices relevantes: índice único sobre `email` (necesario para `get_by_email` y para el 409 en registro duplicado).
- Creación: vía SQLAlchemy `Base.metadata.create_all` al startup, apuntando al mismo `DB_URL` de `db_fuzzing`. Idempotente — no duplica la tabla si ya existe. No afecta `scans` ni `vulnerabilities`.

### scans (EXISTENTE — fuera de alcance, solo referencia)

- Atributos: `id` (SERIAL PK), `target_url`, `scan_date`, `zap_count`, `nuclei_count`, `ffuf_count`, `sqlmap_count`.
- Relaciones: 1 `scans` → N `vulnerabilities`.
- Escrita por: n8n (INSERT del `scan_id` al iniciar) y el flujo de orquestación existente. El Bridge NO la lee ni la escribe.

### vulnerabilities (EXISTENTE — fuera de alcance, solo referencia)

- Atributos: `id` (SERIAL PK), `scan_id` (FK → scans.id), `source` (zap|nuclei|ffuf|sqlmap), `type`, `severity` (low|medium|high|critical), `url`, `description`, `solution`, `cweid`, `evidence`.
- Escrita por: Python SQLMap Worker (INSERT directo) y otros nodos de n8n. El Bridge NO la lee ni la escribe.

## Seed data inicial

Ninguna. La tabla `users` arranca vacía; los usuarios se crean únicamente vía `POST /api/v1/auth/register`. No se requieren datos semilla para `scans`/`vulnerabilities` (son responsabilidad del sistema WASA existente).
