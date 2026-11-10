import { ReadinessResponse, User, Account, LedgerEntry, OnboardingApplication, AuditLog } from './types';

const API_BASE = '/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('bv_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP error ${res.status}`);
  }
  return data as T;
}

export const api = {
  // System Health
  async getReadiness(): Promise<ReadinessResponse> {
    const res = await fetch('/readyz');
    return handleResponse<ReadinessResponse>(res);
  },

  // Auth & Bootstrap
  async getBootstrapStatus(): Promise<{ isBootstrapped: boolean; bootstrappedAt: string | null; initialAdminEmail: string | null }> {
    const res = await fetch(`${API_BASE}/auth/bootstrap/status`);
    return handleResponse(res);
  },

  async bootstrap(data: { secretKey: string; email?: string; password?: string; fullName?: string }): Promise<{
    success: boolean;
    message: string;
    adminId?: string;
    adminEmail?: string;
  }> {
    const res = await fetch(`${API_BASE}/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async login(credentials: { email: string; password: string }): Promise<{ token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    return handleResponse(res);
  },

  async register(data: { email: string; password: string; fullName: string; phone?: string }): Promise<{ token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async getMe(): Promise<{ user: User }> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  // Onboarding
  async submitOnboarding(data: {
    documentType: 'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE';
    documentNumber: string;
    annualIncome: number;
    sourceOfFunds: string;
    legalAddress: string;
  }): Promise<{ message: string; application: OnboardingApplication }> {
    const res = await fetch(`${API_BASE}/onboarding/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async getOnboardingStatus(): Promise<{ userStatus: string; application: OnboardingApplication | null }> {
    const res = await fetch(`${API_BASE}/onboarding/status`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  // Accounts & Ledger
  async getMyAccounts(): Promise<{ accounts: Account[] }> {
    const res = await fetch(`${API_BASE}/accounts/my-accounts`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  async getAccountLedger(accountId: string): Promise<{
    accountId: string;
    accountNumber: string;
    balance: number;
    currency: string;
    ledgerEntries: LedgerEntry[];
  }> {
    const res = await fetch(`${API_BASE}/accounts/${accountId}/ledger`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  async lookupAccount(accountNumber: string): Promise<{
    accountId: string;
    accountNumber: string;
    holderName: string;
    currency: string;
  }> {
    const res = await fetch(`${API_BASE}/accounts/lookup/${accountNumber}`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  async transfer(data: {
    sourceAccountId: string;
    destinationAccountNumber: string;
    amount: number;
    description?: string;
  }): Promise<{ message: string; transaction: any; sourceBalanceAfter: number; ledgerEntries: LedgerEntry[] }> {
    const res = await fetch(`${API_BASE}/accounts/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  // Admin APIs
  async getAdminStats() {
    const res = await fetch(`${API_BASE}/admin/stats`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse<{
      totalUsers: number;
      pendingOnboarding: number;
      activeAccounts: number;
      totalAuditLogs: number;
      ledgerVerification: { verified: boolean; totalEntriesChecked: number; error?: string };
    }>(res);
  },

  async getAdminUsers(query?: { search?: string; role?: string; status?: string }) {
    const searchParams = new URLSearchParams(query as any || {}).toString();
    const res = await fetch(`${API_BASE}/admin/users?${searchParams}`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse<{ users: User[] }>(res);
  },

  async updateUserStatus(userId: string, status: string, reason?: string): Promise<{ user: User }> {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ status, reason })
    });
    return handleResponse(res);
  },

  async getAdminOnboarding(status?: string) {
    const searchParams = new URLSearchParams(status ? { status } : {}).toString();
    const res = await fetch(`${API_BASE}/admin/onboarding${searchParams ? `?${searchParams}` : ''}`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse<{ applications: OnboardingApplication[] }>(res);
  },

  async reviewOnboarding(appId: string, action: 'APPROVE' | 'REJECT', notes?: string, initialGrantAmount: number = 1000): Promise<{
    message: string;
    account?: Account;
    transaction?: any;
  }> {
    const res = await fetch(`${API_BASE}/admin/onboarding/${appId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ action, notes, initialGrantAmount })
    });
    return handleResponse(res);
  },

  async getAuditLogs(params?: { limit?: number; offset?: number; action?: string; actorEmail?: string }) {
    const searchParams = new URLSearchParams(params as any || {}).toString();
    const res = await fetch(`${API_BASE}/admin/audit-logs?${searchParams}`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse<{ total: number; logs: AuditLog[] }>(res);
  },

  async verifyLedgerProof() {
    const res = await fetch(`${API_BASE}/admin/ledger/verify`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse<{
      verified: boolean;
      totalEntriesChecked: number;
      error?: string;
      verifiedAt: string;
    }>(res);
  }
};

