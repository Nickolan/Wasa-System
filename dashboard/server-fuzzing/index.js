const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'db_fuzzing',
  password: 'nikolan', 
  port: 5432,
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const { scan_id, severity, source } = req.query;

    const scansResult = await pool.query('SELECT * FROM scans ORDER BY scan_date ASC');
    
    let vulnQuery = 'SELECT * FROM vulnerabilities';
    const vulnParams = [];
    const conditions = [];

    if (scan_id) {
      vulnParams.push(scan_id);
      conditions.push(`scan_id = $${vulnParams.length}`);
    }

    if (severity) {
      vulnParams.push(severity.toLowerCase());
      conditions.push(`severity = $${vulnParams.length}`);
    }

    if (source) {
      vulnParams.push(source);
      conditions.push(`source = $${vulnParams.length}`);
    }

    if (conditions.length > 0) {
      vulnQuery += ' WHERE ' + conditions.join(' AND ');
    }

    const vulnsResult = await pool.query(vulnQuery, vulnParams);

    const responseData = {
      scans: scansResult.rows,
      vulnerabilities: vulnsResult.rows
    };

    res.json(responseData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.listen(port, () => {
  console.log(`Backend corriendo en http://localhost:${port}`);
});