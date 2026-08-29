# 🛡️ Laboratorio de Fuzzing y Escaneo Automatizado

Este proyecto es un sistema de automatización de seguridad ofensiva y defensiva (Blue Team) desarrollado por **Nicolas Navarrete** y **Lautaro Ferreria**, estudiante de la **Universidad Tecnológica Nacional (UTN)** en Mendoza, Argentina. El objetivo principal es orquestar herramientas de seguridad líderes en la industria para realizar reconocimientos y detecciones de vulnerabilidades de manera profesional y escalable.

## 🏗️ Arquitectura del Sistema

El flujo utiliza una arquitectura basada en eventos para evitar cuellos de botella en escaneos profundos:
1. **Orquestación:** n8n (instalado localmente en Windows 11) coordina el descubrimiento de activos.
2. **Descubrimiento:** OWASP ZAP realiza el spidering inicial y escaneos pasivos.
3. **Escaneo Rápido:** ffuf y Nuclei ejecutan pruebas de fuzzing y detección de vulnerabilidades conocidas en paralelo.
4. **Escaneo Pesado (Asíncrono):** Las URLs con parámetros se envían a una cola en **Redis (Memurai)**. Un **Worker de Python** externo consume estas tareas y ejecuta **SQLMap** con niveles de riesgo elevados (Level 5 / Risk 3) sin bloquear n8n.
5. **Persistencia:** Todos los hallazgos se consolidan en una base de datos **PostgreSQL**.

---

## 🚀 Requisitos Previos

* **Sistema Operativo:** Windows 11.
* **n8n:** Instalación local (Node.js).
* **Base de Datos:** PostgreSQL local.
* **Redis:** Memurai LTS (Developer Edition) instalado como servicio.
* **Seguridad:** OWASP ZAP instalado y configurado en el puerto 8090.
* **Lenguajes:** Python 3.10+ con las librerías `redis` y `psycopg2-binary`.

---

## 🛠️ Instalación de Herramientas

Descargá y configurá las herramientas en tu directorio de trabajo (ej: `C:\Herramientas\`):

### 1. Nuclei (ProjectDiscovery)
* **Ejecutable:** Descargá `nuclei_windows_amd64.zip` desde las [Releases oficiales de GitHub](https://github.com/projectdiscovery/nuclei/releases). Extraé el archivo `nuclei.exe` y guardalo en `C:\Herramientas\`.
* **Plantillas:** Cloná el repositorio de templates para que el flujo pueda invocarlas:
  `git clone https://github.com/projectdiscovery/nuclei-templates.git`
* **Actualización:** Podés correr `nuclei -up` desde la terminal para mantenerlo al día.

### 2. ffuf (Fuzz Faster U Fool)
* **Ejecutable:** Descargá `ffuf_windows_amd64.zip` desde las [Releases oficiales de GitHub](https://github.com/ffuf/ffuf/releases). Extraé el archivo `ffuf.exe` y guardalo en `C:\Herramientas\`.

### 3. SQLMap
* **Repositorio:** Cloná el proyecto oficial:
  `git clone https://github.com/sqlmapproject/sqlmap.git`
* **Nota:** Asegurate de que la ruta en el Worker de Python apunte correctamente a `C:\Herramientas\sqlmap\sqlmap.py`.

### 4. Memurai LTS (Developer Edition)
* **Sistema** Descarga la version `LTS` de la edicion Developer en [Memurai](https://www.memurai.com/get-memurai)

---

## 🔧 Configuración de Variables de Entorno (n8n)

Antes de ejecutar el flujo por primera vez, es necesario definir un conjunto de variables de entorno que n8n leerá en tiempo de ejecución. Los nodos de código del flujo están escritos para **leer estas variables si existen** y, en caso contrario, recurrir a un valor por defecto. Configurarlas evita tener que editar el código de los nodos y mantiene fuera del flujo cualquier dato sensible (claves de API, identificadores de sesión, correo de notificación).

> **Importante:** el archivo `Flujo_Fuzzing_N8N.json` publicado en este repositorio está despersonalizado. Las claves, el identificador de sesión y el correo aparecen como marcadores (`REEMPLAZAR_CON_TU_...`) o valores de ejemplo. Estas variables son el mecanismo previsto para inyectar los valores reales sin modificar el flujo.

### Cómo definir las variables

n8n expone en los nodos de código únicamente las variables de entorno cuyo nombre comienza con el prefijo `WASA_`, junto con las variables de sistema. Para el resto (por ejemplo `NUCLEI_PATH`), definí el prefijo permitido antes de iniciar n8n.

En PowerShell (Windows 11), en la **misma terminal** desde la que vas a iniciar n8n:

```powershell
# Permitir que los nodos de código accedan a las variables de entorno
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE = "false"

# Rutas de las herramientas (ajustá a tu instalación en C:\Herramientas\)
$env:NUCLEI_PATH      = "C:\Herramientas\nuclei.exe"
$env:NUCLEI_TEMPLATES = "C:\Herramientas\nuclei-templates"
$env:FFUF_PATH        = "C:\Herramientas\ffuf.exe"
$env:FFUF_WORDLIST    = "C:\Herramientas\wordlists\common.txt"

# Directorios de salida
$env:WASA_TOOLS_DIR   = "C:\Herramientas\resultados"
$env:WASA_REPORTS_DIR = "C:\Herramientas\reportes"

# Conexión y credenciales de OWASP ZAP
$env:ZAP_URL          = "http://localhost:8090"
$env:ZAP_API_KEY      = "TU_API_KEY_DE_ZAP"

# Parámetros del objetivo de laboratorio y notificación
$env:WASA_TARGET_URL       = "http://localhost:8081/"
$env:WASA_PHPSESSID        = "TU_PHPSESSID_DE_DVWA"
$env:WASA_NOTIFICATION_EMAIL = "tu-correo@tudominio.com"

# Iniciar n8n en la misma sesión
npx n8n
```

Para que las variables persistan entre reinicios sin volver a exportarlas, podés definirlas a nivel de usuario con `setx` (requiere reabrir la terminal) o mediante un archivo `.env` cargado por n8n.

### Referencia de variables

| Variable | Usada en | Valor por defecto | Descripción |
| --- | --- | --- | --- |
| `NUCLEI_PATH` | Nuclei Scann | `nuclei` | Ruta al ejecutable de Nuclei. Requerido si no está en el `PATH`. |
| `NUCLEI_TEMPLATES` | Nuclei Scann | `./nuclei-templates` | Ruta al repositorio de plantillas clonado. |
| `FFUF_PATH` | ffuf | `ffuf` | Ruta al ejecutable de ffuf. Requerido si no está en el `PATH`. |
| `FFUF_WORDLIST` | ffuf | `./wordlists/common.txt` | Diccionario para el fuzzing de rutas. |
| `WASA_TOOLS_DIR` | ffuf, Nuclei Scann | `./resultados` | Directorio donde se escriben los JSON crudos de las herramientas. |
| `WASA_REPORTS_DIR` | Reporte Final | `./reportes` | Directorio donde se guarda el reporte Markdown final. |
| `ZAP_URL` | URL Ejemplo | `http://localhost:8090` | URL base de la API de OWASP ZAP. |
| `ZAP_API_KEY` | URL Ejemplo | `REEMPLAZAR_CON_TU_ZAP_API_KEY` | **Sensible.** Clave de API de ZAP. |
| `WASA_TARGET_URL` | URL Ejemplo | `http://localhost:8081/` | Objetivo por defecto para los disparos Schedule y manual. |
| `WASA_PHPSESSID` | URL Ejemplo | `REEMPLAZAR_CON_TU_PHPSESSID` | **Sensible.** Cookie de sesión autenticada de DVWA. |
| `WASA_NOTIFICATION_EMAIL` | URL Ejemplo | `tu-correo@example.com` | **Sensible.** Destinatario del reporte en disparos Schedule y manual. |

Las variables de sistema `USERPROFILE`, `HOME`, `APPDATA` y `LOCALAPPDATA` también se leen dentro del nodo Nuclei Scann, pero Windows ya las provee y **no requieren configuración manual**.

### Nota sobre el disparo por Webhook

El flujo admite tres modos de disparo (Schedule, manual y Webhook), los tres convergen en el mismo nodo de inicialización. Cuando el ciclo se dispara por el nodo **Webhook** (POST a `/webhook/wasa-scan`, con autenticación por cabecera), los siguientes valores se toman del cuerpo de la petición y **tienen prioridad sobre las variables de entorno**:

| Propiedad del body | Reemplaza a |
| --- | --- |
| `target_url` | `WASA_TARGET_URL` |
| `phpsessid` | `WASA_PHPSESSID` |
| `sqlmap_level` | nivel de SQLMap (por defecto 2) |
| `sqlmap_risk` | riesgo de SQLMap (por defecto 1) |
| `email` | `WASA_NOTIFICATION_EMAIL` |

En los disparos por Schedule o manual, el body no existe y el flujo usa siempre los valores de las variables de entorno con nivel 2 / riesgo 1. La credencial de cabecera del Webhook debe crearse en n8n antes de activar el flujo; no se incluye en el archivo publicado.

---
## 🐍 Configuración del Entorno de Python

Para asegurar que el Worker funcione correctamente sin conflictos de dependencias, seguí estos pasos en `C:\Herramientas\`:

1. **Crear Entorno Virtual:**
   ```bash
   python -m venv venv

2. **Activar Entorno Virtual:**
   ```bash
   .\venv\Scripts\activate

3. **Instalar Dependencias:**
   ```bash
   pip install -r requirements.txt

1. **Ejecutar script de python:**
   ```bash
   python worker_sqlmap.py

---

## 📊 Configuración de Base de Datos

Ejecutá el siguiente script SQL para preparar las tablas de persistencia en PostgreSQL:

```sql
-- Tabla para el historial de escaneos
CREATE TABLE scans (
    id SERIAL PRIMARY KEY,
    target_url TEXT NOT NULL,
    scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_vulnerabilities INT,
    critical_count INT,
    high_count INT,
    medium_count INT,
    low_count INT,
    report_path TEXT
);

-- Tabla para el detalle de vulnerabilidades encontradas
CREATE TABLE vulnerabilities (
    id SERIAL PRIMARY KEY,
    scan_id INT REFERENCES scans(id),
    source TEXT, -- ZAP, Nuclei, ffuf, SQLMap
    type TEXT,
    severity TEXT,
    url TEXT,
    description TEXT,
    solution TEXT,
    evidence TEXT,
    cweid INT
);
```

# 🛡️ Ejecución del Laboratorio
## 1. Iniciar el Worker de SQLMap
Este script debe estar corriendo en una terminal independiente para procesar la cola de Redis:
# C:\Herramientas\worker_sqlmap.py

```python
import redis
import subprocess
import json

r = redis.Redis(host='localhost', port=6379, db=0)
print("🛡️ Worker activo. Esperando tareas de n8n...")

while True:
    _, task_raw = r.blpop('sqlmap_tasks', 0)
    task = json.loads(task_raw)
    url = task.get('url')
    
    # Ejecución intensiva de SQLMap
    command = f"python C:\\Herramientas\\sqlmap\\sqlmap.py -u {url} --batch --level 5 --risk 3"
    subprocess.run(command, shell=True)
```

**Ejecutar archivo**
```bash
  pip install -r requirements.txt
```

## 2. Ejecutar n8n
* Importá el flujo Flujo Fuzzing con Postgres (4).json.

* Configurá las credenciales de Postgres y el nodo Redis (Host: localhost, Port: 6379).

* Asegúrate de que el nodo ZAP Spider apunte a tu API Key local.

* Iniciá el flujo manualmente o mediante el trigger programado.

### 📝 Notas de Implementación
* El nodo Combinaicon de Datos en n8n espera 3 entradas (ffuf, Nuclei, ZAP) antes de generar el reporte inicial.

* Los resultados de SQLMap se insertan de forma asíncrona una vez que el worker finaliza su tarea.

* El reporte final se genera automáticamente en formato Markdown en la ruta configurada (C:\Herramientas\).

Proyecto desarrollado para la UTN Mendoza - 2026