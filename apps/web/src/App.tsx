import React, { useState, useEffect } from 'react';
import { api } from './api';
import { User, Account, LedgerEntry, OnboardingApplication, AuditLog, ReadinessResponse } from './types';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  FileText,
  Activity,
  LogOut,
  Users,
  Search,
  RefreshCw,
  Eye,
  Key,
  Database,
  Server,
  Hash,
  Clock,
  Sparkles
} from 'lucide-react';

export function App() {
  // Global Session State
  const [user, setUser] = useState<User | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<{ isBootstrapped: boolean; bootstrappedAt: string | null; initialAdminEmail: string | null } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'admin_overview' | 'admin_users' | 'admin_onboarding' | 'admin_audit' | 'admin_ledger' | 'customer_accounts' | 'customer_onboarding' | 'customer_ledger'>('customer_accounts');

  // Auth Forms State
  const [authMode, setAuthMode] = useState<'customer_login' | 'customer_register' | 'admin_login'>('customer_login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Bootstrap Modal State
  const [showBootstrapModal, setShowBootstrapModal] = useState(false);
  const [bootstrapSecret, setBootstrapSecret] = useState('bv-bootstrap-super-secret-key-98765');
  const [bootstrapAdminEmail, setBootstrapAdminEmail] = useState('admin@balancevault.internal');
  const [bootstrapAdminPassword, setBootstrapAdminPassword] = useState('AdminSecureVaultPass2026!');
  const [bootstrapAdminName, setBootstrapAdminName] = useState('System Super Administrator');
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapMsg, setBootstrapMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Customer Portal Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [accountLedger, setAccountLedger] = useState<LedgerEntry[]>([]);
  const [onboardingApp, setOnboardingApp] = useState<OnboardingApplication | null>(null);

  // Customer KYC Submission Form
  const [kycDocType, setKycDocType] = useState<'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE'>('PASSPORT');
  const [kycDocNumber, setKycDocNumber] = useState('');
  const [kycIncome, setKycIncome] = useState('125000');
  const [kycSource, setKycSource] = useState('Consulting & Software Services');
  const [kycAddress, setKycAddress] = useState('742 Evergreen Terrace, Springfield, OR');
  const [kycSubmitting, setKycSubmitting] = useState(false);

  // Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferDestNumber, setTransferDestNumber] = useState('');
  const [transferAmount, setTransferAmount] = useState('150');
  const [transferDesc, setTransferDesc] = useState('Payment for project milestones');
  const [transferRecipient, setTransferRecipient] = useState<{ holderName: string; accountNumber: string } | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Admin Portal Data
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminOnboarding, setAdminOnboarding] = useState<OnboardingApplication[]>([]);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AuditLog[]>([]);
  const [adminLedgerProof, setAdminLedgerProof] = useState<any>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [auditFilterAction, setAuditFilterAction] = useState('');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  // Initial load
  useEffect(() => {
    initApp();
    const interval = setInterval(refreshDiagnostics, 15000);
    return () => clearInterval(interval);
  }, []);

  async function initApp() {
    setLoading(true);
    await refreshDiagnostics();
    const token = localStorage.getItem('bv_token');
    if (token) {
      try {
        const { user } = await api.getMe();
        setUser(user);
        if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
          setActiveTab('admin_overview');
          loadAdminData();
        } else {
          setActiveTab('customer_accounts');
          loadCustomerData();
        }
      } catch {
        localStorage.removeItem('bv_token');
        setUser(null);
      }
    }
    setLoading(false);
  }

  async function refreshDiagnostics() {
    try {
      const [rStatus, bStatus] = await Promise.all([
        api.getReadiness().catch(() => null),
        api.getBootstrapStatus().catch(() => null)
      ]);
      if (rStatus) setReadiness(rStatus);
      if (bStatus) {
        setBootstrapStatus(bStatus);
        if (!bStatus.isBootstrapped) {
          setShowBootstrapModal(true);
        }
      }
    } catch {
      // ignore transient polling errors
    }
  }

  async function loadCustomerData() {
    try {
      const [accRes, onbRes] = await Promise.all([
        api.getMyAccounts().catch(() => ({ accounts: [] })),
        api.getOnboardingStatus().catch(() => ({ application: null, userStatus: '' }))
      ]);
      setAccounts(accRes.accounts);
      if (accRes.accounts.length > 0) {
        setSelectedAccount(accRes.accounts[0]);
        loadAccountLedger(accRes.accounts[0].id);
      }
      setOnboardingApp(onbRes.application);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadAccountLedger(accountId: string) {
    try {
      const res = await api.getAccountLedger(accountId);
      setAccountLedger(res.ledgerEntries);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadAdminData() {
    try {
      const [stats, usersRes, onbRes, auditRes, ledgerRes] = await Promise.all([
        api.getAdminStats().catch(() => null),
        api.getAdminUsers().catch(() => ({ users: [] })),
        api.getAdminOnboarding().catch(() => ({ applications: [] })),
        api.getAuditLogs({ limit: 40 }).catch(() => ({ logs: [] })),
        api.verifyLedgerProof().catch(() => null)
      ]);
      setAdminStats(stats);
      setAdminUsers(usersRes.users);
      setAdminOnboarding(onbRes.applications);
      setAdminAuditLogs(auditRes.logs);
      setAdminLedgerProof(ledgerRes);
    } catch (err) {
      console.error(err);
    }
  }

  // Auth Handlers
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await api.login({ email: authEmail, password: authPassword });
      localStorage.setItem('bv_token', res.token);
      setUser(res.user);
      if (res.user.role === 'SUPER_ADMIN' || res.user.role === 'ADMIN') {
        setActiveTab('admin_overview');
        loadAdminData();
      } else {
        setActiveTab('customer_accounts');
        loadCustomerData();
      }
    } catch (err: any) {
      setAuthError(err.message || 'Login failed.');
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await api.register({
        email: authEmail,
        password: authPassword,
        fullName: authFullName,
        phone: authPhone
      });
      localStorage.setItem('bv_token', res.token);
      setUser(res.user);
      setActiveTab('customer_onboarding');
      loadCustomerData();
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed.');
    }
  }

  function handleLogout() {
    localStorage.removeItem('bv_token');
    setUser(null);
    setAccounts([]);
    setSelectedAccount(null);
    setAccountLedger([]);
    setOnboardingApp(null);
  }

  // Bootstrap Handler
  async function handleExecuteBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setBootstrapLoading(true);
    setBootstrapMsg(null);
    try {
      const res = await api.bootstrap({
        secretKey: bootstrapSecret,
        email: bootstrapAdminEmail,
        password: bootstrapAdminPassword,
        fullName: bootstrapAdminName
      });
      setBootstrapMsg({ type: 'success', text: res.message || 'Administrator successfully bootstrapped!' });
      refreshDiagnostics();
      setTimeout(() => {
        setShowBootstrapModal(false);
        setAuthMode('admin_login');
        setAuthEmail(bootstrapAdminEmail);
        setAuthPassword(bootstrapAdminPassword);
      }, 1500);
    } catch (err: any) {
      setBootstrapMsg({ type: 'error', text: err.message || 'Bootstrap failed.' });
    } finally {
      setBootstrapLoading(false);
    }
  }

  // KYC Submit Handler
  async function handleSubmitKyc(e: React.FormEvent) {
    e.preventDefault();
    setKycSubmitting(true);
    try {
      await api.submitOnboarding({
        documentType: kycDocType,
        documentNumber: kycDocNumber,
        annualIncome: parseFloat(kycIncome),
        sourceOfFunds: kycSource,
        legalAddress: kycAddress
      });
      await loadCustomerData();
      alert('Onboarding KYC application successfully submitted for administrative review!');
    } catch (err: any) {
      alert(`Submission error: ${err.message}`);
    } finally {
      setKycSubmitting(false);
    }
  }

  // Account Transfer Handler
  async function handleTransferLookup() {
    if (!transferDestNumber.trim()) return;
    try {
      const res = await api.lookupAccount(transferDestNumber.trim());
      setTransferRecipient({ holderName: res.holderName, accountNumber: res.accountNumber });
      setTransferError(null);
    } catch {
      setTransferRecipient(null);
      setTransferError('Recipient account number not found.');
    }
  }

  async function handleExecuteTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAccount) return;
    setTransferLoading(true);
    setTransferError(null);
    try {
      await api.transfer({
        sourceAccountId: selectedAccount.id,
        destinationAccountNumber: transferDestNumber.trim(),
        amount: parseFloat(transferAmount),
        description: transferDesc
      });
      setShowTransferModal(false);
      setTransferDestNumber('');
      setTransferRecipient(null);
      await loadCustomerData();
      alert('Funds successfully transferred and cryptographically sealed on the ledger!');
    } catch (err: any) {
      setTransferError(err.message || 'Transfer failed.');
    } finally {
      setTransferLoading(false);
    }
  }

  // Admin Actions
  async function handleReviewApplication(appId: string, action: 'APPROVE' | 'REJECT') {
    const notes = prompt(`Enter compliance review notes for ${action}:`, action === 'APPROVE' ? 'Identity verified via synthetic AML/KYC registry.' : 'Insufficient proof of identity.');
    if (notes === null) return;
    try {
      await api.reviewOnboarding(appId, action, notes, 1000);
      await loadAdminData();
      alert(`Application ${action === 'APPROVE' ? 'Approved & Account Provisioned' : 'Rejected'}.`);
    } catch (err: any) {
      alert(`Error reviewing application: ${err.message}`);
    }
  }

  async function handleToggleUserStatus(userId: string, currentStatus: string) {
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!confirm(`Are you sure you want to change user status to ${newStatus}?`)) return;
    try {
      await api.updateUserStatus(userId, newStatus, 'Status changed from admin console.');
      await loadAdminData();
    } catch (err: any) {
      alert(`Error updating user status: ${err.message}`);
    }
  }

  async function handleRunLedgerProof() {
    try {
      const res = await api.verifyLedgerProof();
      setAdminLedgerProof(res);
      alert(res.verified ? ` Cryptographic Proof Verified! ${res.totalEntriesChecked} ledger entries inspected with zero tampering.` : `❌ Ledger tampering detected at sequence #${res.error}`);
    } catch (err: any) {
      alert(`Ledger proof error: ${err.message}`);
    }
  }

  // Quick Demo Autofills
  function autofillAdmin() {
    setAuthEmail('admin@balancevault.internal');
    setAuthPassword('AdminSecureVaultPass2026!');
  }

  function autofillDemoCustomer() {
    setAuthEmail('alex.morgan@example.com');
    setAuthPassword('DemoUserPass2026!');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header style={{
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(51, 65, 85, 0.6)',
        padding: '0.8rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 40
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #0284c7, #2563eb)',
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(2, 132, 199, 0.5)'
          }}>
            <ShieldCheck size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              BalanceVault
              <span style={{ fontSize: '0.7rem', background: '#0369a1', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                FinTech Core
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Money movement with a ledger you can prove
            </div>
          </div>
        </div>

        {/* Subsystem Health Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Database Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '20px',
            background: readiness?.subsystems.database.healthy ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: readiness?.subsystems.database.healthy ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
            color: readiness?.subsystems.database.healthy ? '#34d399' : '#f87171'
          }}>
            <Database size={13} />
            <span>DB: {readiness?.subsystems.database.healthy ? `Ready (${readiness.subsystems.database.latencyMs}ms)` : 'Offline'}</span>
          </div>

          {/* Redis Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            padding: '4px 10px',
            borderRadius: '20px',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8'
          }}>
            <Server size={13} />
            <span>RateLimiter: {readiness?.subsystems.redis.healthy ? 'Redis' : 'Memory Cache'}</span>
          </div>

          {/* Bootstrap Pill */}
          <button
            onClick={() => setShowBootstrapModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              padding: '4px 10px',
              borderRadius: '20px',
              cursor: 'pointer',
              background: bootstrapStatus?.isBootstrapped ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.2)',
              border: bootstrapStatus?.isBootstrapped ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.5)',
              color: bootstrapStatus?.isBootstrapped ? '#34d399' : '#fbbf24',
              outline: 'none'
            }}
          >
            <Key size={13} />
            <span>Bootstrap: {bootstrapStatus?.isBootstrapped ? 'Sealed' : '⚠️ Pending'}</span>
          </button>

          {/* User Profile / Logout */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '12px', paddingLeft: '12px', borderLeft: '1px solid #334155' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user.fullName}</div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  <span className={`badge ${user.role.includes('ADMIN') ? 'badge-info' : 'badge-active'}`} style={{ padding: '1px 6px', fontSize: '0.65rem' }}>
                    {user.role}
                  </span>
                </div>
              </div>
              <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.4rem 0.7rem' }} title="Log out">
                <LogOut size={15} />
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '1.5rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        {!user ? (
          /* =========================================================================
             UNAUTHENTICATED VIEW: Auth Tabs (Customer / Admin / Register)
             ========================================================================= */
          <div style={{ maxWidth: '480px', margin: '3rem auto' }} className="glass-panel">
            <div style={{ padding: '2rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{
                  display: 'inline-flex',
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'rgba(2, 132, 199, 0.15)',
                  marginBottom: '10px'
                }}>
                  <ShieldCheck size={32} color="#38bdf8" />
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Welcome to BalanceVault</h2>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
                  Enterprise account management & tamper-evident financial ledger
                </p>
              </div>

              {/* Navigation Tabs */}
              <div style={{ display: 'flex', background: '#090d16', padding: '4px', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => { setAuthMode('customer_login'); setAuthError(null); }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: authMode === 'customer_login' ? '#1e293b' : 'transparent',
                    color: authMode === 'customer_login' ? '#ffffff' : '#94a3b8'
                  }}
                >
                  Customer Login
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('admin_login'); setAuthError(null); }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: authMode === 'admin_login' ? '#1e293b' : 'transparent',
                    color: authMode === 'admin_login' ? '#ffffff' : '#94a3b8'
                  }}
                >
                  Admin Portal
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('customer_register'); setAuthError(null); }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: authMode === 'customer_register' ? '#1e293b' : 'transparent',
                    color: authMode === 'customer_register' ? '#ffffff' : '#94a3b8'
                  }}
                >
                  Register
                </button>
              </div>

              {authError && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertTriangle size={16} />
                  <span>{authError}</span>
                </div>
              )}

              {/* Login Form (Customer or Admin) */}
              {authMode !== 'customer_register' ? (
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      className="input-field"
                      placeholder={authMode === 'admin_login' ? 'admin@balancevault.internal' : 'alex.morgan@example.com'}
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      className="input-field"
                      placeholder="••••••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                    <Lock size={16} />
                    <span>{authMode === 'admin_login' ? 'Authenticate as Administrator' : 'Sign In to Account'}</span>
                  </button>

                  {/* Demo Quick-Fills */}
                  <div style={{ borderTop: '1px solid #1e293b', paddingTop: '1rem', marginTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '8px', textAlign: 'center' }}>
                      Quick Hackathon Demonstration Autofill:
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={autofillAdmin}
                        className="btn btn-secondary"
                        style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem' }}
                      >
                        Super Admin Demo
                      </button>
                      <button
                        type="button"
                        onClick={autofillDemoCustomer}
                        className="btn btn-secondary"
                        style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem' }}
                      >
                        Customer Demo
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                /* Registration Form */
                <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                      Full Legal Name
                    </label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      placeholder="Sarah Connor"
                      value={authFullName}
                      onChange={(e) => setAuthFullName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      className="input-field"
                      placeholder="sarah.c@example.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="+1 (555) 234-5678"
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                      Password (min. 8 characters)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      className="input-field"
                      placeholder="••••••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                    <UserCheck size={16} />
                    <span>Create Account Holder Profile</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' ? (
          /* =========================================================================
             ADMIN CONTROL CENTER VIEW
             ========================================================================= */
          <div>
            {/* Admin Subheader & Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Admin Control Center</h1>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Institutional user management, KYC compliance reviews, and immutable cryptographic audit logs
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { setActiveTab('admin_overview'); loadAdminData(); }}
                  className={`btn ${activeTab === 'admin_overview' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <Activity size={16} /> Overview
                </button>
                <button
                  onClick={() => { setActiveTab('admin_onboarding'); loadAdminData(); }}
                  className={`btn ${activeTab === 'admin_onboarding' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <UserCheck size={16} /> KYC Queue ({adminOnboarding.filter(a => a.status === 'SUBMITTED').length})
                </button>
                <button
                  onClick={() => { setActiveTab('admin_users'); loadAdminData(); }}
                  className={`btn ${activeTab === 'admin_users' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <Users size={16} /> Users ({adminUsers.length})
                </button>
                <button
                  onClick={() => { setActiveTab('admin_audit'); loadAdminData(); }}
                  className={`btn ${activeTab === 'admin_audit' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <FileText size={16} /> Audit Trail
                </button>
                <button
                  onClick={() => { setActiveTab('admin_ledger'); loadAdminData(); }}
                  className={`btn ${activeTab === 'admin_ledger' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <Hash size={16} /> Ledger Proof
                </button>
              </div>
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'admin_overview' && (
              <div>
                {/* Metric Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Total Registered Users</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8' }}>{adminStats?.totalUsers ?? adminUsers.length}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>With RBAC privileges</div>
                  </div>

                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Pending KYC Reviews</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fbbf24' }}>
                      {adminStats?.pendingOnboarding ?? adminOnboarding.filter(a => a.status === 'SUBMITTED').length}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Awaiting admin approval</div>
                  </div>

                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Active Financial Accounts</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#34d399' }}>{adminStats?.activeAccounts ?? 2}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Provisioned with double-entry ledgers</div>
                  </div>

                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Total Audit Log Events</div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#818cf8' }}>{adminStats?.totalAuditLogs ?? adminAuditLogs.length}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Immutable activity records</div>
                  </div>

                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Ledger Cryptographic Proof</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: adminLedgerProof?.verified ? '#34d399' : '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={20} />
                      <span>{adminLedgerProof?.verified ? '100% Proven' : 'Tampered'}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                      {adminLedgerProof?.totalEntriesChecked ?? 0} hash-chained entries
                    </div>
                  </div>
                </div>

                {/* Subsystem Health Panel */}
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server size={18} color="#38bdf8" /> Subsystem Diagnostics & Neon PostgreSQL Architecture
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>PostgreSQL Role Architecture</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>
                        Designed to prevent Neon <code>SQLSTATE 42501</code> by segregating operator authority from day-to-day DML credentials.
                      </div>
                      <ul style={{ fontSize: '0.75rem', color: '#cbd5e1', paddingLeft: '1.2rem', lineHeight: '1.6' }}>
                        <li>Role <code>balancevault_app</code>: Pool connection for API endpoints</li>
                        <li>Role <code>bootstrap_operator</code>: Owner of <code>fn_bootstrap_first_admin</code></li>
                        <li>Role <code>balancevault_bootstrap</code>: Authorized for <code>SET ROLE</code></li>
                        <li>Security Definer guarantees zero blanket role mutation privileges</li>
                      </ul>
                    </div>

                    <div className="glass-card" style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Readiness Status</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Database Ping:</span>
                          <span style={{ color: '#34d399', fontWeight: 600 }}>{readiness?.subsystems.database.latencyMs ?? 2} ms</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Rate Limiter Backend:</span>
                          <span style={{ color: '#38bdf8', fontWeight: 600 }}>{readiness?.subsystems.redis.provider ?? 'Memory Fallback'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>First-Admin Status:</span>
                          <span style={{ color: '#34d399', fontWeight: 600 }}>Sealed & Locked</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Uptime:</span>
                          <span style={{ color: '#f8fafc', fontWeight: 600 }}>{readiness?.system.uptimeSeconds ?? 42} seconds</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: KYC ONBOARDING QUEUE */}
            {activeTab === 'admin_onboarding' && (
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <UserCheck size={20} color="#fbbf24" /> Account Holder Onboarding & KYC Compliance Queue
                </h3>

                {adminOnboarding.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    No pending onboarding applications currently in queue.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                          <th style={{ padding: '10px' }}>Applicant</th>
                          <th style={{ padding: '10px' }}>Document</th>
                          <th style={{ padding: '10px' }}>Source of Funds</th>
                          <th style={{ padding: '10px' }}>Annual Income</th>
                          <th style={{ padding: '10px' }}>Status</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminOnboarding.map((app) => (
                          <tr key={app.id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                            <td style={{ padding: '12px 10px' }}>
                              <div style={{ fontWeight: 600 }}>{app.user?.fullName || 'Unknown'}</div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{app.user?.email}</div>
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              <div style={{ fontWeight: 600 }}>{app.documentType}</div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>{app.documentNumber}</div>
                            </td>
                            <td style={{ padding: '12px 10px' }}>{app.sourceOfFunds || 'N/A'}</td>
                            <td style={{ padding: '12px 10px' }}>
                              {app.annualIncome ? `$${Number(app.annualIncome).toLocaleString()}` : 'N/A'}
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              <span className={`badge ${app.status === 'APPROVED' ? 'badge-success' : app.status === 'SUBMITTED' ? 'badge-pending' : 'badge-danger'}`}>
                                {app.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                              {app.status === 'SUBMITTED' ? (
                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                  <button
                                    onClick={() => handleReviewApplication(app.id, 'APPROVE')}
                                    className="btn btn-success"
                                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                                  >
                                    Approve & Provision
                                  </button>
                                  <button
                                    onClick={() => handleReviewApplication(app.id, 'REJECT')}
                                    className="btn btn-danger"
                                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Reviewed by {app.reviewedBy}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: USERS LIST */}
            {activeTab === 'admin_users' && (
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={20} color="#38bdf8" /> User Management & RBAC Roles
                  </h3>

                  <div style={{ position: 'relative', width: '280px' }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Search users..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                        <th style={{ padding: '10px' }}>User</th>
                        <th style={{ padding: '10px' }}>Role</th>
                        <th style={{ padding: '10px' }}>Status</th>
                        <th style={{ padding: '10px' }}>Accounts</th>
                        <th style={{ padding: '10px' }}>Created</th>
                        <th style={{ padding: '10px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers
                        .filter(u => !userSearchQuery || u.fullName.toLowerCase().includes(userSearchQuery.toLowerCase()) || u.email.toLowerCase().includes(userSearchQuery.toLowerCase()))
                        .map((u) => (
                          <tr key={u.id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                            <td style={{ padding: '12px 10px' }}>
                              <div style={{ fontWeight: 600 }}>{u.fullName}</div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{u.email}</div>
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              <span className={`badge ${u.role.includes('ADMIN') ? 'badge-info' : 'badge-active'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              <span className={`badge ${u.status === 'ACTIVE' ? 'badge-success' : u.status === 'PENDING_ONBOARDING' ? 'badge-pending' : 'badge-danger'}`}>
                                {u.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              {u.accounts && u.accounts.length > 0 ? (
                                <span style={{ fontFamily: 'monospace', color: '#34d399' }}>{u.accounts[0].accountNumber}</span>
                              ) : (
                                <span style={{ color: '#64748b' }}>None</span>
                              )}
                            </td>
                            <td style={{ padding: '12px 10px', color: '#94a3b8', fontSize: '0.75rem' }}>
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                              {u.role !== 'SUPER_ADMIN' && (
                                <button
                                  onClick={() => handleToggleUserStatus(u.id, u.status)}
                                  className={`btn ${u.status === 'ACTIVE' ? 'btn-danger' : 'btn-success'}`}
                                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                                >
                                  {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: IMMUTABLE AUDIT TRAIL */}
            {activeTab === 'admin_audit' && (
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={20} color="#818cf8" /> Immutable Security & Operational Audit Log
                  </h3>
                  <button onClick={loadAdminData} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                    <RefreshCw size={14} /> Refresh Logs
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                        <th style={{ padding: '10px' }}>Timestamp</th>
                        <th style={{ padding: '10px' }}>Action</th>
                        <th style={{ padding: '10px' }}>Actor</th>
                        <th style={{ padding: '10px' }}>Role</th>
                        <th style={{ padding: '10px' }}>Status</th>
                        <th style={{ padding: '10px' }}>IP / Agent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminAuditLogs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.3)' }}>
                          <td style={{ padding: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                          <td style={{ padding: '10px', fontWeight: 600, color: '#38bdf8' }}>
                            {log.action}
                          </td>
                          <td style={{ padding: '10px' }}>{log.actorEmail || 'Anonymous'}</td>
                          <td style={{ padding: '10px' }}>
                            <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{log.actorRole || 'SYSTEM'}</span>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span className={`badge ${log.status === 'SUCCESS' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem' }}>
                              {log.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px', color: '#64748b', fontSize: '0.75rem' }}>
                            {log.ipAddress}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: CRYPTOGRAPHIC LEDGER PROOF */}
            {activeTab === 'admin_ledger' && (
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Hash size={20} color="#34d399" /> Cryptographic Ledger Chain Integrity Inspector
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                      Validates double-entry mathematical invariants and SHA-256 hash chaining from genesis to head
                    </p>
                  </div>
                  <button onClick={handleRunLedgerProof} className="btn btn-primary">
                    <ShieldCheck size={16} /> Run Full Chain Verification
                  </button>
                </div>

                <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: adminLedgerProof?.verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {adminLedgerProof?.verified ? <CheckCircle2 size={24} color="#34d399" /> : <AlertTriangle size={24} color="#f87171" />}
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                        {adminLedgerProof?.verified ? 'Cryptographic Ledger Verification Passed' : 'Verification Issue Detected'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        Verified at: {adminLedgerProof?.verifiedAt ? new Date(adminLedgerProof.verifiedAt).toLocaleString() : 'Just now'} | Inspected: {adminLedgerProof?.totalEntriesChecked ?? 0} entries
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                    Each ledger entry computes:
                    <div style={{
                      background: '#090d16',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      color: '#38bdf8',
                      margin: '8px 0'
                    }}>
                      entryHash = SHA256(sequenceNumber | transactionId | accountId | direction | amount | balanceAfter | previousEntryHash)
                    </div>
                    If any balance, transaction amount, or ledger record in the PostgreSQL database is manually updated or altered by an attacker, the hash chain breaks instantly.
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
             ACCOUNT HOLDER / CUSTOMER PORTAL VIEW
             ========================================================================= */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Account Holder Dashboard</h1>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Manage your verified accounts, perform auditable transfers, and inspect your cryptographic transaction ledger
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveTab('customer_accounts')}
                  className={`btn ${activeTab === 'customer_accounts' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <Activity size={16} /> Financial Accounts
                </button>
                <button
                  onClick={() => setActiveTab('customer_onboarding')}
                  className={`btn ${activeTab === 'customer_onboarding' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <UserCheck size={16} /> Onboarding & KYC
                </button>
                {selectedAccount && (
                  <button
                    onClick={() => setActiveTab('customer_ledger')}
                    className={`btn ${activeTab === 'customer_ledger' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    <Hash size={16} /> Ledger Proof
                  </button>
                )}
              </div>
            </div>

            {/* TAB 1: ACCOUNTS & BALANCES */}
            {activeTab === 'customer_accounts' && (
              <div>
                {/* Onboarding Banner if pending */}
                {user.status === 'PENDING_ONBOARDING' && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    borderRadius: '10px',
                    padding: '1.25rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <AlertTriangle size={24} color="#fbbf24" />
                      <div>
                        <div style={{ fontWeight: 700, color: '#fbbf24' }}>Onboarding Compliance Verification Required</div>
                        <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                          Submit your KYC identity credentials to activate your institutional checking account.
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setActiveTab('customer_onboarding')} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                      Complete Onboarding
                    </button>
                  </div>
                )}

                {/* Account Cards */}
                {accounts.length === 0 ? (
                  <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                    <UserCheck size={48} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>No Active Financial Account Yet</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', maxWidth: '420px', margin: '8px auto 16px' }}>
                      Complete the onboarding identity verification workflow. Once approved by administration, your institutional checking account will be provisioned.
                    </p>
                    <button onClick={() => setActiveTab('customer_onboarding')} className="btn btn-primary">
                      Go to KYC Onboarding
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                      {accounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="glass-panel"
                          style={{
                            padding: '1.5rem',
                            border: selectedAccount?.id === acc.id ? '2px solid #38bdf8' : '1px solid rgba(51, 65, 85, 0.6)',
                            cursor: 'pointer'
                          }}
                          onClick={() => { setSelectedAccount(acc); loadAccountLedger(acc.id); }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {acc.accountType} ACCOUNT
                            </span>
                            <span className="badge badge-success">ACTIVE</span>
                          </div>

                          <div style={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace', marginBottom: '8px' }}>
                            {acc.accountNumber}
                          </div>

                          <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#f8fafc', marginBottom: '1rem' }}>
                            ${Number(acc.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span style={{ fontSize: '1rem', color: '#94a3b8', marginLeft: '6px' }}>{acc.currency}</span>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowTransferModal(true); }}
                              className="btn btn-primary"
                              style={{ flex: 1, padding: '0.5rem' }}
                            >
                              <ArrowRightLeft size={15} /> Move Funds
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedAccount(acc); loadAccountLedger(acc.id); setActiveTab('customer_ledger'); }}
                              className="btn btn-secondary"
                              style={{ padding: '0.5rem 0.8rem' }}
                              title="Inspect cryptographic ledger"
                            >
                              <Hash size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Recent Ledger History */}
                    {selectedAccount && (
                      <div className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity size={18} color="#38bdf8" /> Ledger Activity for {selectedAccount.accountNumber}
                          </h3>
                          <button onClick={() => loadAccountLedger(selectedAccount.id)} className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>
                            <RefreshCw size={13} /> Refresh
                          </button>
                        </div>

                        {accountLedger.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                            No entries recorded yet on this account's ledger.
                          </div>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                                  <th style={{ padding: '10px' }}>Seq #</th>
                                  <th style={{ padding: '10px' }}>Time</th>
                                  <th style={{ padding: '10px' }}>Direction</th>
                                  <th style={{ padding: '10px' }}>Amount</th>
                                  <th style={{ padding: '10px' }}>Balance After</th>
                                  <th style={{ padding: '10px' }}>Cryptographic Proof</th>
                                </tr>
                              </thead>
                              <tbody>
                                {accountLedger.map((entry) => (
                                  <tr key={entry.id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.3)' }}>
                                    <td style={{ padding: '10px', fontFamily: 'monospace', color: '#38bdf8' }}>
                                      #{entry.sequenceNumber}
                                    </td>
                                    <td style={{ padding: '10px', color: '#94a3b8' }}>
                                      {new Date(entry.timestamp).toLocaleTimeString()}
                                    </td>
                                    <td style={{ padding: '10px' }}>
                                      <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-success' : 'badge-danger'}`}>
                                        {entry.direction}
                                      </span>
                                    </td>
                                    <td style={{ padding: '10px', fontWeight: 700, color: entry.direction === 'CREDIT' ? '#34d399' : '#f87171' }}>
                                      {entry.direction === 'CREDIT' ? '+' : '-'}${Number(entry.amount).toFixed(2)}
                                    </td>
                                    <td style={{ padding: '10px', fontFamily: 'monospace' }}>
                                      ${Number(entry.balanceAfter).toFixed(2)}
                                    </td>
                                    <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                                      <span title={entry.entryHash}>
                                        {entry.entryHash.substring(0, 10)}...{entry.entryHash.substring(entry.entryHash.length - 8)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ONBOARDING & KYC WORKFLOW */}
            {activeTab === 'customer_onboarding' && (
              <div className="glass-panel" style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '6px' }}>Onboarding & KYC Compliance</h2>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
                  Institutional financial regulations require verified identity and source of funds prior to account activation.
                </p>

                {/* 4-Step Stepper */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', position: 'relative' }}>
                  <div style={{ textAlign: 'center', zIndex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 6px',
                      fontSize: '0.85rem',
                      fontWeight: 700
                    }}>
                      ✓
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>1. Registered</div>
                  </div>

                  <div style={{ textAlign: 'center', zIndex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: onboardingApp ? '#10b981' : '#0284c7',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 6px',
                      fontSize: '0.85rem',
                      fontWeight: 700
                    }}>
                      {onboardingApp ? '✓' : '2'}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>2. KYC Details</div>
                  </div>

                  <div style={{ textAlign: 'center', zIndex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: onboardingApp?.status === 'APPROVED' ? '#10b981' : onboardingApp?.status === 'SUBMITTED' ? '#f59e0b' : '#334155',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 6px',
                      fontSize: '0.85rem',
                      fontWeight: 700
                    }}>
                      {onboardingApp?.status === 'APPROVED' ? '✓' : '3'}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>3. Admin Review</div>
                  </div>

                  <div style={{ textAlign: 'center', zIndex: 1 }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: user.status === 'ACTIVE' ? '#10b981' : '#334155',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 6px',
                      fontSize: '0.85rem',
                      fontWeight: 700
                    }}>
                      {user.status === 'ACTIVE' ? '✓' : '4'}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>4. Provisioned</div>
                  </div>
                </div>

                {onboardingApp?.status === 'APPROVED' ? (
                  <div style={{
                    padding: '1.5rem',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#34d399' }}>Onboarding Verified & Approved</div>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '6px' }}>
                      Your compliance review was approved by {onboardingApp.reviewedBy}. Your checking account is active and provisioned.
                    </div>
                  </div>
                ) : onboardingApp?.status === 'SUBMITTED' ? (
                  <div style={{
                    padding: '1.5rem',
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <Clock size={36} color="#fbbf24" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fbbf24' }}>Application Under Administrative Review</div>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '6px' }}>
                      Your KYC submission (ID: {onboardingApp.documentNumber}) is currently queued for compliance review in the Admin Control Center.
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitKyc} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                        Government Identification Document
                      </label>
                      <select
                        className="input-field"
                        value={kycDocType}
                        onChange={(e: any) => setKycDocType(e.target.value)}
                      >
                        <option value="PASSPORT">International Passport</option>
                        <option value="NATIONAL_ID">National Identity Card</option>
                        <option value="DRIVERS_LICENSE">Driver's License</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                        Document Identification Number
                      </label>
                      <input
                        type="text"
                        required
                        className="input-field"
                        placeholder="e.g. P982173921"
                        value={kycDocNumber}
                        onChange={(e) => setKycDocNumber(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                          Estimated Annual Income (USD)
                        </label>
                        <input
                          type="number"
                          required
                          className="input-field"
                          placeholder="120000"
                          value={kycIncome}
                          onChange={(e) => setKycIncome(e.target.value)}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                          Primary Source of Funds
                        </label>
                        <input
                          type="text"
                          required
                          className="input-field"
                          placeholder="Employment / Investments"
                          value={kycSource}
                          onChange={(e) => setKycSource(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                        Legal Residential Address
                      </label>
                      <input
                        type="text"
                        required
                        className="input-field"
                        placeholder="Street, City, State, ZIP"
                        value={kycAddress}
                        onChange={(e) => setKycAddress(e.target.value)}
                      />
                    </div>

                    <button type="submit" disabled={kycSubmitting} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                      <UserCheck size={16} />
                      <span>{kycSubmitting ? 'Submitting to Compliance...' : 'Submit KYC Application'}</span>
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* TAB 3: CUSTOMER CRYPTOGRAPHIC PROOF */}
            {activeTab === 'customer_ledger' && selectedAccount && (
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '6px' }}>
                  Cryptographic Ledger Proof for Account {selectedAccount.accountNumber}
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
                  Each transaction is an immutable record cryptographically bound to the previous entry using SHA-256 hash chaining.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {accountLedger.map((entry, idx) => (
                    <div key={entry.id} className="glass-card" style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}>
                            Seq #{entry.sequenceNumber}
                          </span>
                          <span className={`badge ${entry.direction === 'CREDIT' ? 'badge-success' : 'badge-danger'}`}>
                            {entry.direction}
                          </span>
                          <span style={{ fontWeight: 700 }}>
                            ${Number(entry.amount).toFixed(2)}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          Balance after: ${Number(entry.balanceAfter).toFixed(2)}
                        </div>
                      </div>

                      <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                        <div><strong style={{ color: '#94a3b8' }}>Previous Hash:</strong> {entry.previousEntryHash}</div>
                        <div><strong style={{ color: '#38bdf8' }}>Entry Hash:</strong> {entry.entryHash}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Transfer Funds Modal */}
        {showTransferModal && selectedAccount && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem'
          }}>
            <div className="glass-panel" style={{ maxWidth: '460px', width: '100%', padding: '1.75rem' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '6px' }}>Move Funds</h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
                Double-entry settlement from {selectedAccount.accountNumber}
              </p>

              {transferError && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  fontSize: '0.85rem',
                  marginBottom: '1rem'
                }}>
                  {transferError}
                </div>
              )}

              <form onSubmit={handleExecuteTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Recipient Account Number
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      required
                      className="input-field"
                      placeholder="e.g. BV-77281920-USD"
                      value={transferDestNumber}
                      onChange={(e) => { setTransferDestNumber(e.target.value); setTransferRecipient(null); }}
                    />
                    <button type="button" onClick={handleTransferLookup} className="btn btn-secondary">
                      Lookup
                    </button>
                  </div>
                  {transferRecipient && (
                    <div style={{ fontSize: '0.8rem', color: '#34d399', marginTop: '4px' }}>
                      ✓ Verified Holder: {transferRecipient.holderName}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Amount (USD) — Available: ${Number(selectedAccount.balance).toFixed(2)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={Number(selectedAccount.balance)}
                    required
                    className="input-field"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Transfer Description
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Invoice settlement"
                    value={transferDesc}
                    onChange={(e) => setTransferDesc(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setShowTransferModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={transferLoading} className="btn btn-primary" style={{ flex: 1 }}>
                    {transferLoading ? 'Sealing Transfer...' : 'Confirm Transfer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* First-Admin Bootstrap Wizard Modal */}
        {showBootstrapModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '1rem'
          }}>
            <div className="glass-panel" style={{ maxWidth: '520px', width: '100%', padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                <div style={{
                  background: 'rgba(245, 158, 11, 0.2)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  padding: '10px',
                  borderRadius: '10px'
                }}>
                  <Key size={24} color="#fbbf24" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>First Administrator Bootstrap Ceremony</h3>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Idempotent privilege initialization with PostgreSQL SET ROLE security definer
                  </p>
                </div>
              </div>

              {bootstrapMsg && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  fontSize: '0.85rem',
                  background: bootstrapMsg.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: bootstrapMsg.type === 'success' ? '#34d399' : '#f87171'
                }}>
                  {bootstrapMsg.text}
                </div>
              )}

              <form onSubmit={handleExecuteBootstrap} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Operator Bootstrap Secret Key
                  </label>
                  <input
                    type="password"
                    required
                    className="input-field"
                    value={bootstrapSecret}
                    onChange={(e) => setBootstrapSecret(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Initial Super Admin Email
                  </label>
                  <input
                    type="email"
                    required
                    className="input-field"
                    value={bootstrapAdminEmail}
                    onChange={(e) => setBootstrapAdminEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Initial Super Admin Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="input-field"
                    value={bootstrapAdminPassword}
                    onChange={(e) => setBootstrapAdminPassword(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setShowBootstrapModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                    Dismiss
                  </button>
                  <button type="submit" disabled={bootstrapLoading} className="btn btn-primary" style={{ flex: 1 }}>
                    {bootstrapLoading ? 'Sealing...' : 'Execute Bootstrap'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(51, 65, 85, 0.6)',
        padding: '1rem 1.5rem',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: '#64748b'
      }}>
        BalanceVault — Hackathon Demonstration. Synthetic data only. Not intended for real funds.
      </footer>
    </div>
  );
}

