# Flujos Principales

## Flujo 1: Registro de usuario

**Disparador**: click en "Crear Cuenta" desde el muro de autenticación.
**Actor**: Usuario Anónimo.

**Pasos**:
1. `RegisterModal.tsx` se abre; usuario completa email + password (+ confirmPassword).
2. Validación client-side (Zod, `registerSchema`): email válido, password ≥8 chars, coincidencia de confirmPassword.
3. `POST /api/v1/auth/register` → `AuthRouter` → `AuthService`.
4. `AuthService` verifica email no duplicado (`UserRepository.get_by_email`), hashea password con bcrypt, llama `UserRepository.create` → INSERT en tabla `users` de PostgreSQL `db_fuzzing`.
5. `AuthService.create_access_token` firma JWT (HS256, `JWT_SECRET`).
6. FastAPI retorna 201 + `TokenResponse`.
7. Frontend: `authStore.login(token, email)` guarda en state + localStorage.
8. Modal se cierra; `ScanFormWidget` detecta `isAuthenticated=true` → muestra aviso ético + `ScanForm`.

**Diagrama de secuencia**:
```
UA → RegisterModal → registerApi → FastAPI AuthRouter → AuthService → UserRepository → PostgreSQL(users)
                                                                ← TokenResponse
UA ← authStore.login(token) ← Frontend
```

**Casos de error**:
- Email duplicado → 409 Conflict → "Este email ya está registrado."
- Password <8 chars → 400 (Pydantic) → error inline client-side ya lo previene, pero el backend también valida.

## Flujo 2: Login

**Disparador**: click en "Iniciar Sesión".
**Actor**: Usuario Anónimo con cuenta existente.

**Pasos**:
1. `LoginModal.tsx` se abre; usuario completa email + password.
2. `POST /api/v1/auth/login` → `AuthService.login`: busca usuario por email, verifica bcrypt.
3. Si OK: firma JWT, retorna 200 + `TokenResponse`.
4. Si falla (email inexistente o password incorrecta): 401 genérico, sin distinguir causa (evita enumeración de usuarios).
5. Frontend guarda JWT en authStore/localStorage; modal cierra; formulario de escaneo aparece.

**Casos de error**:
- 401 → "Credenciales incorrectas."

## Flujo 3: Escaneo (usuario ya autenticado)

**Disparador**: click en "Escanear" con checkbox ético marcado.
**Actor**: Usuario Evaluador.

**Pasos**:
1. `useScanForm.ts` valida con Zod (`scanSchema`) y llama `submitScan.ts`.
2. `POST /api/v1/scan/start` con `Authorization: Bearer <jwt>` (adjuntado automáticamente por el interceptor Axios).
3. `ScanRouter`: `Depends(get_current_user)` decodifica y valida el JWT → 401 si inválido/expirado.
4. Validación Pydantic del body (`ScanRequest`).
5. Chequeo de rate limit (slowapi, 10 req/IP/60min) → 429 si excedido.
6. `ScanService.start_scan`: genera `scan_id` (UUID v4), arma `N8nPayload` — incluye el email del usuario autenticado (`current_user`, ya resuelto por `get_current_user` en el paso 3), NUNCA un email provisto en el body de `ScanRequest` (RN-WS-16, CHANGE-23).
7. `ScanUoW` → `N8nRepository.forward_scan`: `POST` httpx al Webhook Trigger de n8n con header `X-WASA-TOKEN`.
8. Si n8n responde 200: FastAPI retorna 202 Accepted + `ScanResponse`. Si no: 502 Bad Gateway.
9. Frontend: en 202 → mensaje de éxito (~2s) → `window.location.href = VITE_DASHBOARD_URL`.
10. n8n ejecuta el workflow en background: ZAP Spider → ZAP Active Scan → Nuclei → ffuf → LPUSH `sqlmap_tasks` (Redis) → Python SQLMap Worker (BLPOP) → INSERT en `vulnerabilities` (PostgreSQL `db_fuzzing`).
11. Al finalizar, n8n compone el reporte (Markdown → HTML) y lo envía por email (nodo `Send email`) al email recibido en el payload del webhook (el mismo email del usuario que disparó el escaneo en el paso 6) — CHANGE-23.
12. Dashboard React/Node.js muestra resultados en tiempo real (fuera del alcance de este proyecto).

**Diagrama de secuencia**:
```
UE → ScanForm → FastAPI ScanRouter (JWT guard) → ScanService → N8nRepository → n8n Webhook
                                                                                    │
                                                        200 OK ─────────────────────┘
UE ← 202 Accepted ← FastAPI
UE → redirect → Dashboard (React/Node.js)

                                          (background) n8n ejecuta ZAP/Nuclei/ffuf/SQLMap
                                          → Send email → UE.email (CHANGE-23)
```

**Casos de error**:
- 401 (sin JWT / expirado) → authStore.logout() + "Sesión expirada."
- 400/422 (validación) → error inline por campo.
- 429 (rate limit) → "Límite de escaneos alcanzado. Intente en X minutos."
- 502 (n8n no responde) → "El sistema de escaneo no está disponible. Intente más tarde."
