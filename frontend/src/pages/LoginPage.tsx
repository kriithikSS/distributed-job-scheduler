import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Zap, ArrowRight, Shield, Cpu, Activity, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const features = [
  { icon: Cpu, text: 'Atomic job claiming with SELECT FOR UPDATE SKIP LOCKED' },
  { icon: Activity, text: 'Real-time metrics, throughput charts & worker monitoring' },
  { icon: Shield, text: 'Multi-tenant with org-scoped authentication' },
];

const LoginPage: React.FC = () => {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form.name, form.email, form.password);
      }
    },
    onSuccess: () => { toast.success('Welcome!'); navigate('/'); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Authentication failed';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      background: 'var(--bg-base)',
    }}>

      {/* ── LEFT PANEL — Branding ── */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #0d0f18 0%, #0a0b0f 100%)',
        borderRight: '1px solid var(--border)',
      }}>
        {/* Gradient mesh background */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute',
            width: 600, height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)',
            top: '-150px', left: '-150px',
          }} />
          <div style={{
            position: 'absolute',
            width: 400, height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 65%)',
            bottom: '0px', right: '-100px',
          }} />
          {/* Grid lines */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }}>
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--violet), var(--cyan))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 30px rgba(139,92,246,0.5)',
            }}>
              <Zap size={20} color="white" fill="white" />
            </div>
            <span style={{
              fontSize: 18, fontWeight: 700,
              background: 'linear-gradient(135deg, #f0f2ff, #a78bfa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>JobScheduler</span>
          </div>
        </div>

        {/* Hero text */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 100,
            background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
            marginBottom: 24,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emerald)', boxShadow: '0 0 8px var(--emerald)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--violet-light)', letterSpacing: '0.05em' }}>
              PRODUCTION-GRADE PLATFORM
            </span>
          </div>

          <h1 style={{
            fontSize: 42, fontWeight: 800, lineHeight: 1.1, marginBottom: 20,
            background: 'linear-gradient(160deg, #f0f2ff 0%, #a78bfa 50%, #67e8f9 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Distributed Job<br />Scheduling at Scale
          </h1>

          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 40, maxWidth: 380 }}>
            Reliably execute millions of asynchronous background jobs across
            horizontally-scaled workers with atomic claiming and full observability.
          </p>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {features.map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={15} color="var(--violet-light)" />
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, paddingTop: 6 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom stats bar */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1, borderRadius: 12, overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'var(--border)',
        }}>
          {[
            { value: '5', label: 'Job Types' },
            { value: '3', label: 'Retry Strategies' },
            { value: '12', label: 'DB Tables' },
          ].map((s) => (
            <div key={s.label} style={{
              padding: '16px 20px',
              background: 'rgba(18,20,26,0.95)',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: 22, fontWeight: 800, lineHeight: 1,
                background: 'linear-gradient(135deg, var(--violet-light), var(--cyan-light))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                marginBottom: 4,
              }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL — Auth form ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle background glow */}
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />

        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {mode === 'login'
                ? 'Sign in to your workspace'
                : 'Get started in seconds'}
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-elevated)',
            borderRadius: 10,
            padding: 4,
            marginBottom: 28,
            border: '1px solid var(--border)',
          }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: '9px', borderRadius: 7, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                  background: mode === m
                    ? 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(6,182,212,0.15))'
                    : 'transparent',
                  color: mode === m ? 'var(--violet-light)' : 'var(--text-muted)',
                  boxShadow: mode === m ? '0 1px 8px rgba(139,92,246,0.15)' : 'none',
                  border: mode === m ? '1px solid rgba(139,92,246,0.25)' : '1px solid transparent',
                }}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {mode === 'register' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                  FULL NAME
                </label>
                <input
                  className="form-input"
                  placeholder="Jane Smith"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={{ padding: '11px 14px', fontSize: 14 }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                EMAIL ADDRESS
              </label>
              <input
                className="form-input"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={{ padding: '11px 14px', fontSize: 14 }}
                autoComplete="email"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  style={{ padding: '11px 44px 11px 14px', fontSize: 14, paddingRight: 44 }}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px', borderRadius: 9, border: 'none', cursor: mutation.isPending ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 700, marginTop: 6,
                background: mutation.isPending
                  ? 'rgba(139,92,246,0.5)'
                  : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                color: 'white',
                boxShadow: mutation.isPending ? 'none' : '0 4px 20px rgba(139,92,246,0.45)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { if (!mutation.isPending) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
            >
              {mutation.isPending ? (
                <><div className="spinner" /> {mode === 'login' ? 'Signing in...' : 'Creating account...'}</>
              ) : (
                <>{mode === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or try the demo</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Demo credentials */}
          <button
            type="button"
            onClick={() => {
              setForm({ name: '', email: 'demo@example.com', password: 'password123' });
              setMode('login');
            }}
            style={{
              width: '100%', padding: '11px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.4)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            }}
          >
            <CheckCircle2 size={14} color="var(--emerald)" />
            <span>Use demo account</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-muted)' }}>
              demo@example.com
            </span>
          </button>

          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 28 }}>
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
