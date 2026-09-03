/**
 * Formas de dominio de la slice `entities/dashboard` (D-2 de design.md,
 * CHANGE-26).
 *
 * El espejo del backend tiene que ser fiel: `fastapi_bridge/schemas/
 * dashboard_schemas.py` declara `ScanRow`/`VulnerabilityRow` con
 * `model_config = ConfigDict(extra="allow")` y **todos** los campos
 * opcionales (`| None = None`), porque proyectan el esquema de las tablas
 * compartidas `scans`/`vulnerabilities` tal como está — un esquema que
 * pertenece al sistema WASA existente y puede incorporar columnas sin que
 * el Bridge se entere. Un tipo cerrado y obligatorio del lado del frontend
 * mentiría sobre lo que efectivamente llega: `severity: string` obligatorio
 * es exactamente la mentira que hacía que `vuln.severity.charAt(0)`
 * reventara en producción con la severidad nula que el contrato permite.
 *
 * Todos los campos conocidos son opcionales y nulables, y el index
 * signature admite cualquier columna no enumerada. Nombres en `snake_case`,
 * igual que el cable — mismo criterio que `entities/scan/model/types.ts`:
 * "un renombrado silencioso convierte un contrato verificable en una
 * traducción que nadie ejercita hasta que rompe".
 *
 * Son tipos, no schemas: nadie los parsea en runtime (D-2 — Zod aportaría
 * poco y costaría mucho contra una respuesta deliberadamente abierta). Cada
 * consumidor tolera el campo ausente porque el tipo lo obliga en el punto
 * de uso, no porque un borde lo haya validado.
 */

/** Una fila de la tabla `scans`, tal como la proyecta el Bridge. */
export interface DashboardScanRow {
  id?: number | null
  target_url?: string | null
  scan_date?: string | null
  [key: string]: unknown
}

/** Una fila de la tabla `vulnerabilities`, tal como la proyecta el Bridge. */
export interface DashboardVulnerabilityRow {
  id?: number | null
  scan_id?: number | null
  source?: string | null
  type?: string | null
  severity?: string | null
  cweid?: string | null
  evidence?: string | null
  url?: string | null
  description?: string | null
  solution?: string | null
  [key: string]: unknown
}

/** Cuerpo de `GET /api/v1/dashboard` (200): dos colecciones abiertas. */
export interface DashboardResponse {
  scans: DashboardScanRow[]
  vulnerabilities: DashboardVulnerabilityRow[]
}
