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