import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Layers, Briefcase, Cpu, Skull,
  BarChart2, LogOut, Settings, Zap
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const NAV = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/queues',  icon: Layers,          label: 'Queues' },
  { to: '/jobs',    icon: Briefcase,       label: 'Jobs' },
  { to: '/workers', icon: Cpu,             label: 'Workers' },
  { to: '/dlq',     icon: Skull,           label: 'Dead Letter Queue' },
  { to: '/metrics', icon: BarChart2,       label: 'Metrics' },
];

const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Zap size={16} color="white" />
        </div>
        <span className="sidebar-logo-text">JobScheduler</span>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigation</div>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          {user?.email}
        </div>
        <button className="nav-item" onClick={handleLogout}>
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
