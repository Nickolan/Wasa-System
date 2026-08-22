import React, { useState, useEffect } from 'react';
import { 
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import './App.css';
import Sidebar from './components/Sidebar';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterScanId, setFilterScanId] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [currentView, setCurrentView] = useState('dashboard');
  
  // Nuevo estado para la ventana flotante
  const [selectedVuln, setSelectedVuln] = useState(null);

  useEffect(() => {
    setLoading(true);
    
    const params = new URLSearchParams();
    if (filterScanId) params.append('scan_id', filterScanId);
    if (filterSeverity) params.append('severity', filterSeverity);
    if (filterSource) params.append('source', filterSource);

    fetch(`http://localhost:5000/api/dashboard?${params.toString()}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Fallo al conectar con el servidor backend');
        }
        return response.json();
      })
      .then(dbData => {
        setData(dbData);
        console.log(dbData);
        
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [filterScanId, filterSeverity, filterSource]);

  if (loading && !data) {
    return <div className="loading-container">Cargando datos desde PostgreSQL...</div>;
  }

  if (error) {
    return <div className="error-text"><h2>Error: {error}</h2></div>;
  }

  const scans = data.scans;
  
  const vulnerabilities = data.vulnerabilities.map(vuln => ({
    ...vuln,
    severity: vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1)
  }));

  const scanCountLabel = filterScanId ? 'Escaneo Analizado' : 'Escaneos Realizados';
  const scanCountValue = filterScanId ? filterScanId : scans.length;
  const totalVulnerabilities = vulnerabilities.length;
  
  const criticalVulnerabilities = vulnerabilities.filter(
    (vuln) => vuln.severity === 'Critical'
  ).length;

  const severityCounts = vulnerabilities.reduce((acc, vuln) => {
    acc[vuln.severity] = (acc[vuln.severity] || 0) + 1;
    return acc;
  }, {});

  const severityData = Object.keys(severityCounts).map(key => ({
    name: key,
    value: severityCounts[key]
  }));

  const CHART_COLORS = {
    Critical: '#ef4444',
    High: '#f97316',
    Medium: '#eab308',
    Low: '#3b82f6'
  };

  const trendData = [...scans]
    .sort((a, b) => new Date(a.scan_date) - new Date(b.scan_date))
    .map(scan => {
      const dateObj = new Date(scan.scan_date);
      const timeString = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}:${dateObj.getSeconds().toString().padStart(2, '0')}`;
      
      const vulnsInThisScan = vulnerabilities.filter(v => v.scan_id === scan.id).length;

      return {
        fecha: `${dateObj.getDate()}/${dateObj.getMonth() + 1} - ${timeString}`,
        vulnerabilidades: vulnsInThisScan
      };
    });

  const endpointCounts = vulnerabilities.reduce((acc, vuln) => {
    acc[vuln.url] = (acc[vuln.url] || 0) + 1;
    return acc;
  }, {});

  const topEndpoints = Object.keys(endpointCounts)
    .map(url => ({ url, count: endpointCounts[url] }))
    .sort((a, b) => b.count - a.count);

  const renderEmptyState = () => (
    <div className="empty-state">
      <p>No se encontraron vulnerabilidades con los filtros actuales.</p>
    </div>
  );

  const hasData = totalVulnerabilities > 0;

  return (
    <div className="app-wrapper">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      <div className="main-content">
        <section className="filters-section">
        <div className="filter-group url-group">
          <label htmlFor="filter-scan">Escaneo:</label>
          <select
            id="filter-scan"
            value={filterScanId}
            onChange={(e) => setFilterScanId(e.target.value)}
          >
            <option value="">Todos los escaneos históricos</option>
            {scans.map(scan => {
              const dateObj = new Date(scan.scan_date);
              const dateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
              const timeStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
              return (
                <option key={scan.id} value={scan.id}>
                  {`${dateStr} ${timeStr} - ${scan.target_url}`}
                </option>
              );
            })}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-severity">Severidad:</label>
          <select
            id="filter-severity"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-source">Herramienta:</label>
          <select
            id="filter-source"
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="OWASP ZAP">OWASP ZAP</option>
            <option value="Nuclei">Nuclei</option>
            <option value="SQLMap (Worker)">SQLMap</option>
            <option value="ffuf">ffuf</option>
          </select>
        </div>
      </section>

      {currentView === 'dashboard' && (
        <>
          <section className="kpi-grid">
            <div className="kpi-card">
              <h3>{scanCountLabel}</h3>
              <p className="kpi-value">{scanCountValue}</p>
            </div>
            
            <div className="kpi-card">
              <h3>Total Vulnerabilidades</h3>
              <p className="kpi-value">{totalVulnerabilities}</p>
            </div>

            <div className="kpi-card critical">
              <h3>Vulnerabilidades Críticas</h3>
              <p className="kpi-value critical-text">
                {criticalVulnerabilities}
              </p>
            </div>
          </section>

          <section className="charts-grid">
            <div className="chart-card">
              <h3>Vulnerabilidades por Severidad</h3>
              {!hasData ? renderEmptyState() : (
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={severityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {severityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[entry.name]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="chart-card">
              <h3>Evolución Histórica (Vulnerabilidades por Escaneo)</h3>
              {!hasData ? renderEmptyState() : (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 65 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                      dataKey="fecha" 
                      stroke="#94a3b8" 
                      angle={-45} 
                      textAnchor="end" 
                      tickMargin={10}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      allowDecimals={false} 
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="vulnerabilidades" 
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#3b82f6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

        </>
      )}

      {currentView === 'endpoints' && (
        <section className="tables-section">
          <div className="table-card">
            <h3>Endpoints Más Vulnerables</h3>
            {!hasData ? renderEmptyState() : (
              <div className='table-wrapper'>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>URL del Endpoint</th>
                      <th>Cantidad de Fallos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topEndpoints.map((endpoint, index) => (
                      <tr key={index}>
                        <td>{endpoint.url}</td>
                        <td>{endpoint.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {currentView === 'details' && (
        <section className="tables-section">
          <div className="table-card">
            <h3>Detalle Completo de Vulnerabilidades</h3>
            {!hasData ? renderEmptyState() : (
              <div className='table-wrapper full-height'>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fuente</th>
                      <th>Tipo</th>
                      <th>Severidad</th>
                      <th>CWE ID</th>
                      <th>Evidencia</th>
                      <th>URL Afectada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vulnerabilities.map((vuln) => (
                      <tr 
                        key={vuln.id} 
                        className="clickable-row"
                        onClick={() => setSelectedVuln(vuln)}
                      >
                        <td>{vuln.source}</td>
                        <td>{vuln.type}</td>
                        <td>
                          <span className={`badge badge-${vuln.severity}`}>
                            {vuln.severity}
                          </span>
                        </td>
                        <td>{vuln.cweid || 'N/A'}</td>
                        <td>{vuln.evidence || 'N/A'}</td>
                        <td>{vuln.url}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* VENTANA FLOTANTE (MODAL) PARA DETALLES DE VULNERABILIDAD */}
      {selectedVuln && (
        <div className="modal-overlay" onClick={() => setSelectedVuln(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalle de la Vulnerabilidad</h2>
              <button className="close-btn" onClick={() => setSelectedVuln(null)}>&times;</button>
            </div>
            <div className="modal-body">
              
              {/* NUEVO ORDEN: Grilla de 2 columnas para metadatos */}
              <div className="modal-meta-grid">
                <div className="detail-row">
                  <strong>Tipo:</strong> <span>{selectedVuln.type}</span>
                </div>
                <div className="detail-row">
                  <strong>Severidad:</strong> 
                  <span className={`badge badge-${selectedVuln.severity}`}>{selectedVuln.severity}</span>
                </div>
                <div className="detail-row">
                  <strong>Fuente:</strong> <span>{selectedVuln.source}</span>
                </div>
                <div className="detail-row">
                  <strong>CWE ID:</strong> <span>{selectedVuln.cweid || 'Ninguno'}</span>
                </div>
              </div>

              {/* URL Destacada a lo ancho completo */}
              <div className="detail-full url-highlight">
                <strong>URL Afectada:</strong> 
                <span className="url-text">{selectedVuln.url}</span>
              </div>

              <div className="detail-full">
                <strong>Descripción:</strong>
                <p>{selectedVuln.description || 'Sin descripción disponible.'}</p>
              </div>
              <div className="detail-full">
                <strong>Solución:</strong>
                <p>{selectedVuln.solution || 'Sin solución sugerida.'}</p>
              </div>
              <div className="detail-full">
                <strong>Evidencia (Payload/Match):</strong>
                <div className="evidence-box">
                  {selectedVuln.evidence || 'No se capturó evidencia exacta.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default App;