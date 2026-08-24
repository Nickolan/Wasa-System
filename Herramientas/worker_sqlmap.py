import redis
import subprocess
import json
import psycopg2 
import re 
import logging

# --- CONFIGURACIÓN DE LOGS ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("sqlmap-worker")

# --- CONFIGURACIÓN ---
REDIS_CONF = {'host': 'localhost', 'port': 6379, 'db': 0}
DB_CONF = {
    'dbname': 'db_fuzzing', 
    'user': 'postgres',
    'password': 'nikolan',
    'host': 'localhost'
}

r = redis.Redis(**REDIS_CONF)

def extract_payload(stdout_text):
    title_match = re.search(r'Title:\s*(.+)', stdout_text)
    payload_match = re.search(r'Payload:\s*(.+)', stdout_text)
    
    if title_match and payload_match:
        return title_match.group(1).strip(), payload_match.group(1).strip()
    return None, None

def save_to_postgres(url, title, payload, scan_id):
    try:
        logger.info(f"💾 Intentando guardar hallazgo en BD para {url}...")
        conn = psycopg2.connect(**DB_CONF)
        cur = conn.cursor()
        query = """
            INSERT INTO vulnerabilities (scan_id, source, type, cweid, severity, url, description, solution, evidence)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        evidence = f"Técnica: {title}\nPayload: {payload}"
        
        # [FIX 2026-07-27] Severidad hardcodeada corregida de 'critical' a 'high':
        # una inyección SQL confirmada corresponde a CWE-89 / Alto según la
        # clasificación usada en el resto de la tesis (Tabla 8), no a Crítico.
        # Consistente con el mismo fix aplicado en el nodo n8n
        # "Consolidar Resultados Nuclei" (sección 3, procesamiento de SQLMap).
        cur.execute(query, (
            scan_id,
            'SQLMap (Worker)', 
            'SQL Injection', 
            89,
            'high',
            url, 
            'Vulnerabilidad detectada mediante escaneo asíncrono profundo.',
            'Implementar consultas parametrizadas.',
            evidence 
        ))
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"✅ Hallazgo guardado exitosamente en BD para el scan_id={scan_id}")
    except Exception as e:
        logger.error(f"❌ Error al guardar en Postgres: {e}")

logger.info("🛡️ Worker de Seguridad Activo. Esperando tareas...")

while True:
    _, task_raw = r.blpop('sqlmap_tasks', 0)
    
    try:
        task = json.loads(task_raw)
    except json.JSONDecodeError:
        logger.warning(f"⚠️ Basura o mensaje inválido ignorado en Redis: {task_raw}")
        continue 

    # Agregamos un log para ver exactamente qué JSON está llegando
    logger.info(f"📥 Nueva tarea recibida: {task}")
    
    # ¡CORRECCIÓN CRÍTICA AQUÍ! Agregamos 'urlsFound' que es lo que manda n8n
    targets_url = task.get('urlsFound') or task.get('urls') or task.get('url') or []
    current_scan_id = task.get('scan_id', 'Desconocido')
    
    if isinstance(targets_url, str):
        targets_url = [targets_url]

    logger.info(f"🔍 URLs a procesar encontradas: {len(targets_url)}")

    for target_url in targets_url:
        if not target_url:
            continue
            
        logger.info(f"🚀 Iniciando SQLMap en: {target_url}")
        
        level = task.get('level', 2)
        risk = task.get('risk', 1)
        cookie = task.get('cookie', "security=low")


        newCommand = [
            "python",
            "C:\\Users\\Nicolas\\Herramientas\\sqlmap\\sqlmap.py",
            "-u", target_url,
            "--batch",
            "--random-agent",
            f"--level={level}",
            f"--risk={risk}",
            "--cookie", cookie,
            "--flush-session"
        ]
        
        logger.info(f"⚙️ Comando a ejecutar: {newCommand}")
        
        try:
            logger.info("⏳ Ejecutando Subprocess de SQLMap... (esto puede tardar varios minutos)")
            result = subprocess.run(newCommand, capture_output=True, text=True, timeout=600)
            logger.info("✅ Subprocess de SQLMap finalizado.")

            print("🔍 Analizando resultados de SQLMap...")
            
            stdout_lower = result.stdout.lower()
            es_vulnerable = (
                "is vulnerable" in stdout_lower or 
                "injection point(s)" in stdout_lower or
                ("parameter:" in stdout_lower and "payload:" in stdout_lower)
            )
            #logger.info(f"📊 Código de salida: {stdout_lower}")
            
            if es_vulnerable:
                logger.info(f"🔥 ¡VULNERABILIDAD ENCONTRADA en {target_url}!")
                
                try:
                    with open("C:\\Users\\Nicolas\\Herramientas\\reporte_vulnerabilidad.txt", "w", encoding="utf-8") as f:
                        f.write(result.stdout)
                except Exception as e:
                    logger.error(f"⚠️ No se pudo guardar el txt: {e}")

                title, payload = extract_payload(result.stdout)
                
                # Modificamos esta validación para evitar falsos negativos al guardar en la BD
                if title or payload:
                    # Usamos 'Desconocido' si no pudo parsear alguno, para no perder la alerta
                    save_to_postgres(target_url, title or "Múltiples/No parseado", payload or "Revisar TXT", current_scan_id)
                else:
                    logger.warning("⚠️ Hay vulnerabilidad, pero el regex no extrajo el payload. Guardando alerta básica.")
                    save_to_postgres(target_url, "SQLi Confirmado", "Revisar logs/TXT de SQLMap", current_scan_id)
                    
            else:
                logger.info(f"✅ Escaneo limpio para {target_url}. No se encontraron vulnerabilidades.")
                
        except subprocess.TimeoutExpired:
            logger.error(f"⏳ Timeout al escanear {target_url}. La tarea alcanzó los 10 minutos y fue cancelada.")
