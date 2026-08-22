import React from 'react';
import './Sidebar.css';

function Sidebar({ currentView, setCurrentView }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Dashboard de Seguridad Web</h1>
        <p>Equipo Bot Azul - Monitoreo de Vulnerabilidades</p>
      </div>
      <nav className="sidebar-nav">
        <button 
          className={`sidebar-btn ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setCurrentView('dashboard')}
        >
          Panel General
        </button>
        <button 
          className={`sidebar-btn ${currentView === 'details' ? 'active' : ''}`}
          onClick={() => setCurrentView('details')}
        >
          Reporte Detallado
        </button>
        <button 
          className={`sidebar-btn ${currentView === 'endpoints' ? 'active' : ''}`}
          onClick={() => setCurrentView('endpoints')}
        >
          Endpoints Vulnerables
        </button>
      </nav>
    </aside>
  );
}

export default Sidebar;
