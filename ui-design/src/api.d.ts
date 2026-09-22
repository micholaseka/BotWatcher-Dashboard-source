// src/api.d.ts
//
// Deklarasi tipe untuk window.api yang di-inject oleh Electron preload.

interface AccountStatusData {
  accountId: string;
  name: string;
  city: string; // BARU
  enabled: boolean;
  state: "idle" | "starting" | "monitoring" | "stopped" | "offline" | "error";
  loggedIn: boolean | null;
  unreadCount: number | null;
  lastCheckedAt: string | null;
  error: string | null;
  proxyConfigured: boolean;
  proxyServer: string | null;
  proxyUsername: string | null;
}

type ProxyImportError = {
  line: number | null;
  accountId: string;
  message: string;
};

type ProxyImportResult = {
  cancelled: boolean;
  fileName?: string;
  totalRows?: number;
  imported?: number;
  failed?: number;
  parseErrors?: ProxyImportError[];
  errors?: ProxyImportError[];
  accounts?: AccountStatusData[];
};

interface EngineStatus {
  running: boolean;
}

interface EngineLogEntry {
  message: string;
  level: "info" | "success" | "warn" | "error";
  at: string;
}

interface RotationState {
  round: number;
  currentBatch: string[];
  checkedSoFar: number;
  totalAccounts: number;
}

interface Window {
  api: {
    getAccounts: () => Promise<AccountStatusData[]>;
    addAccount: (account: {
      accountId: string;
      name: string;
      city?: string;
    }) => Promise<AccountStatusData[]>;
    onAccountsUpdate: (
      callback: (statuses: AccountStatusData[]) => void,
    ) => () => void;

    getEngineStatus: () => Promise<EngineStatus>;
    startEngine: () => Promise<{
      running: boolean;
      started: boolean;
      reason?: string;
    }>;
    stopEngine: () => Promise<EngineStatus>;
    onEngineStatus: (callback: (status: EngineStatus) => void) => () => void;
    onEngineLog: (callback: (entry: EngineLogEntry) => void) => () => void;

    removeAccount: (accountId: string) => Promise<AccountStatusData[]>;

    updateAccount: (
      accountId: string,
      updates: { name?: string; city?: string },
    ) => Promise<AccountStatusData[]>;
    openReplySession: (
      accountId: string,
    ) => Promise<{ opened: boolean; reused: boolean }>;

    getRotationState: () => Promise<RotationState>;
    onRotationUpdate: (callback: (state: RotationState) => void) => () => void;

    setAccountProxy: (
      accountId: string,
      proxy: {
        server: string;
        username?: string;
        password?: string;
      },
    ) => Promise<AccountStatusData>;

    importProxyCsv: () => Promise<ProxyImportResult>;
    removeAccountProxy: (accountId: string) => Promise<AccountStatusData>;
  };
}
