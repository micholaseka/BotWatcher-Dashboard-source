import { useEffect, useMemo, useState } from "react";
import ProxyModal from "./components/ProxyModal";
type AccountStatus = "active" | "sleeping" | "new" | "error";
type SortOrder = "unread" | "name" | "default";
type FilterStatus = "all" | AccountStatus;
const STALE_THRESHOLD_MS = 15 * 60 * 1000;
function mapApiAccount(account: AccountStatusData): AccountStatusData {
  return {
    accountId: account.accountId,
    name: account.name,
    city: account.city ?? "",
    enabled: account.enabled,
    state: account.state,
    loggedIn: account.loggedIn,
    unreadCount: account.unreadCount,
    lastCheckedAt: account.lastCheckedAt,
    error: account.error,
    proxyConfigured: account.proxyConfigured ?? false,
    proxyServer: account.proxyServer ?? null,
    proxyUsername: account.proxyUsername ?? null,
  };
}
function mapToDisplayStatus(account: AccountStatusData): AccountStatus {
  if (account.state === "error") {
    return "error";
  }
  if (account.state === "starting" || account.state === "idle") {
    return "new";
  }
  if (account.state === "offline" || account.state === "stopped") {
    return "sleeping";
  }
  if (account.lastCheckedAt) {
    const age = Date.now() - new Date(account.lastCheckedAt).getTime();
    if (age > STALE_THRESHOLD_MS) {
      return "sleeping";
    }
  }
  return "active";
}
function formatLastChecked(iso: string | null): string {
  if (!iso) {
    return "Belum pernah dicek";
  }
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) {
    return "Baru saja";
  }
  if (mins < 60) {
    return `${mins} menit lalu`;
  }
  return `${Math.floor(mins / 60)} jam lalu`;
}
function warningFor(
  account: AccountStatusData,
  display: AccountStatus,
): string | null {
  if (display === "error") {
    return account.error || "Terjadi kesalahan";
  }
  if (account.state === "offline") {
    return "Sesi login belum tersedia";
  }
  if (display === "new") {
    return "Menunggu pengecekan...";
  }
  return null;
}
function StatusBadge({ status }: { status: AccountStatus }) {
  const config: Record<
    AccountStatus,
    { label: string; color: string; pulse: boolean }
  > = {
    active: { label: "AKTIF", color: "#22c55e", pulse: true },
    sleeping: { label: "TIDUR", color: "#f59e0b", pulse: false },
    new: { label: "BARU", color: "#3b82f6", pulse: true },
    error: { label: "ERROR", color: "#ef4444", pulse: false },
  };
  const { label, color, pulse } = config[status];
  return (
    <span
      className="flex items-center gap-1.5 text-[10px] font-medium tracking-widest uppercase"
      style={{ color, fontFamily: "var(--font-mono)" }}
    >
      {" "}
      <span
        className={`size-1.5 rounded-full ${pulse ? "pulse-dot" : ""}`}
        style={{ background: color }}
      />{" "}
      {label}{" "}
    </span>
  );
}
function AddAccountModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (accounts: AccountStatusData[]) => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setError("");
    const normalizedId = accountId.trim();
    const normalizedName = name.trim();
    const normalizedCity = city.trim();
    if (!normalizedId) {
      setError("Account ID wajib diisi.");
      return;
    }
    if (!normalizedName) {
      setError("Nama akun wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      const accounts = await window.api.addAccount({
        accountId: normalizedId,
        name: normalizedName,
        city: normalizedCity,
      });
      onCreated(accounts);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)" }}
    >
      {" "}
      <div
        className="w-full max-w-md rounded-xl p-5"
        style={{
          background: "#141820",
          border: "1px solid #2a3050",
          boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
        }}
      >
        {" "}
        <div className="flex items-center justify-between mb-5">
          {" "}
          <div>
            {" "}
            <div className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
              {" "}
              Tambah Profil Akun{" "}
            </div>{" "}
            <div
              className="text-[10px] mt-1"
              style={{ color: "#64748b", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              Profil dibuat tanpa membuka browser.{" "}
            </div>{" "}
          </div>{" "}
          <button
            onClick={onClose}
            disabled={busy}
            className="text-lg"
            style={{ color: "#64748b" }}
          >
            {" "}
            ×{" "}
          </button>{" "}
        </div>{" "}
        <div className="space-y-3">
          {" "}
          <div>
            {" "}
            <label
              className="block text-[10px] mb-1 uppercase tracking-wider"
              style={{ color: "#64748b", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              Account ID{" "}
            </label>{" "}
            <input
              autoFocus
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder="contoh: akun-003"
              className="w-full px-3 py-2 rounded text-xs outline-none"
              style={{
                background: "#10141c",
                border: "1px solid #1e2436",
                color: "#e2e8f0",
                fontFamily: "var(--font-mono)",
              }}
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label
              className="block text-[10px] mb-1 uppercase tracking-wider"
              style={{ color: "#64748b", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              Nama akun{" "}
            </label>{" "}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="contoh: Toko Kediri"
              className="w-full px-3 py-2 rounded text-xs outline-none"
              style={{
                background: "#10141c",
                border: "1px solid #1e2436",
                color: "#e2e8f0",
              }}
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label
              className="block text-[10px] mb-1 uppercase tracking-wider"
              style={{ color: "#64748b", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              Kota{" "}
            </label>{" "}
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="contoh: Kediri"
              className="w-full px-3 py-2 rounded text-xs outline-none"
              style={{
                background: "#10141c",
                border: "1px solid #1e2436",
                color: "#e2e8f0",
              }}
            />{" "}
          </div>{" "}
          {error && (
            <div
              className="px-3 py-2 rounded text-[10px]"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#f87171",
                fontFamily: "var(--font-mono)",
              }}
            >
              {" "}
              {error}{" "}
            </div>
          )}{" "}
        </div>{" "}
        <div className="flex justify-end gap-2 mt-5">
          {" "}
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 rounded text-[10px] uppercase"
            style={{
              background: "#10141c",
              border: "1px solid #1e2436",
              color: "#64748b",
              fontFamily: "var(--font-mono)",
            }}
          >
            {" "}
            Batal{" "}
          </button>{" "}
          <button
            onClick={submit}
            disabled={busy}
            className="px-3 py-2 rounded text-[10px] uppercase"
            style={{
              background: "#3b82f618",
              border: "1px solid #3b82f640",
              color: "#60a5fa",
              fontFamily: "var(--font-mono)",
              opacity: busy ? 0.5 : 1,
            }}
          >
            {" "}
            {busy ? "Menyimpan..." : "Tambahkan"}{" "}
          </button>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
function AccountCard({
  account,
  isChecking,
  onRemove,
  onUpdate,
  onReply,
  onProxy,
}: {
  account: AccountStatusData;
  isChecking: boolean;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: { name?: string; city?: string }) => void;
  onReply: (id: string) => void;
  onProxy: (account: AccountStatusData) => void;
}) {
  const display = mapToDisplayStatus(account);
  const unreadCount = account.unreadCount ?? 0;
  const [editingName, setEditingName] = useState(false);
  const [editingCity, setEditingCity] = useState(false);
  const [nameDraft, setNameDraft] = useState(account.name);
  const [cityDraft, setCityDraft] = useState(account.city ?? "");
  const [replyBusy, setReplyBusy] = useState(false);
  const borderColor = isChecking
    ? "#3b82f6"
    : display === "active"
      ? "rgba(34,197,94,0.18)"
      : display === "sleeping"
        ? "rgba(245,158,11,0.2)"
        : display === "error"
          ? "rgba(239,68,68,0.3)"
          : "rgba(59,130,246,0.3)";
  const headerAccent =
    display === "active"
      ? "#22c55e"
      : display === "sleeping"
        ? "#f59e0b"
        : display === "error"
          ? "#ef4444"
          : "#3b82f6";
  const warning = warningFor(account, display);
  const saveName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== account.name) {
      onUpdate(account.accountId, { name: trimmed });
    } else {
      setNameDraft(account.name);
    }
  };
  const saveCity = () => {
    setEditingCity(false);
    const trimmed = cityDraft.trim();
    if (trimmed !== (account.city ?? "")) {
      onUpdate(account.accountId, { city: trimmed });
    }
  };
  const handleReply = async () => {
    setReplyBusy(true);
    try {
      await onReply(account.accountId);
    } finally {
      setReplyBusy(false);
    }
  };
  return (
    <div
      className="relative flex flex-col rounded-lg overflow-hidden group"
      style={{ border: `1px solid ${borderColor}`, background: "#141820" }}
    >
      {" "}
      <button
        onClick={() => onRemove(account.accountId)}
        className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center size-5 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "#1e2436", color: "#64748b" }}
        title="Hapus akun"
      >
        {" "}
        ×{" "}
      </button>{" "}
      <div
        className="flex items-center gap-2 px-3 pt-3 pb-2"
        style={{ borderBottom: "1px solid #1e2436", background: "#10141c" }}
      >
        {" "}
        <div
          className="flex items-center justify-center size-7 rounded text-[11px] font-semibold flex-shrink-0"
          style={{
            background: `${headerAccent}18`,
            color: headerAccent,
            fontFamily: "var(--font-mono)",
          }}
        >
          {" "}
          {account.name.charAt(0)}{" "}
        </div>{" "}
        <div className="min-w-0 flex-1">
          {" "}
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  (event.target as HTMLInputElement).blur();
                }
              }}
              className="w-full text-[12px] font-semibold bg-transparent outline-none"
              style={{
                color: "#e2e8f0",
                border: "1px solid #2a3050",
                borderRadius: 4,
                padding: "1px 4px",
              }}
            />
          ) : (
            <div
              className="text-[12px] font-semibold truncate pr-5 cursor-text"
              style={{ color: "#e2e8f0" }}
              onClick={() => setEditingName(true)}
              title="Klik untuk edit nama"
            >
              {" "}
              {account.name}{" "}
            </div>
          )}{" "}
          <div
            className="text-[9px] truncate"
            style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
          >
            {" "}
            {account.accountId}{" "}
          </div>{" "}
          {editingCity ? (
            <input
              autoFocus
              value={cityDraft}
              placeholder="Kota promosi..."
              onChange={(event) => setCityDraft(event.target.value)}
              onBlur={saveCity}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  (event.target as HTMLInputElement).blur();
                }
              }}
              className="w-full text-[9px] bg-transparent outline-none mt-0.5"
              style={{
                color: "#60a5fa",
                border: "1px solid #2a3050",
                borderRadius: 4,
                padding: "1px 4px",
                fontFamily: "var(--font-mono)",
              }}
            />
          ) : (
            <div
              className="text-[9px] truncate cursor-text mt-0.5"
              style={{
                color: account.city ? "#60a5fa" : "#374151",
                fontFamily: "var(--font-mono)",
              }}
              onClick={() => setEditingCity(true)}
              title="Klik untuk edit kota"
            >
              {" "}
              📍 {account.city || "Set kota..."}{" "}
            </div>
          )}{" "}
        </div>{" "}
      </div>{" "}
      <div className="flex items-center justify-between px-3 py-2">
        {" "}
        <StatusBadge status={display} />{" "}
        <div className="flex items-center gap-1">
          {" "}
          <span
            className="size-1.5 rounded-full"
            style={{ background: unreadCount > 0 ? "#ef4444" : "#374151" }}
          />{" "}
          <span
            className="text-[11px] tabular-nums font-semibold"
            style={{
              color: unreadCount > 0 ? "#ef4444" : "#374151",
              fontFamily: "var(--font-mono)",
            }}
          >
            {" "}
            {unreadCount}{" "}
          </span>{" "}
        </div>{" "}
      </div>{" "}
      {warning && (
        <div
          className="px-3 pb-2 text-[9px]"
          style={{ color: "#f59e0b", fontFamily: "var(--font-mono)" }}
        >
          {" "}
          ⚠ {warning}{" "}
        </div>
      )}{" "}
      {isChecking ? (
        <div
          className="px-3 pb-2 text-[9px]"
          style={{ color: "#3b82f6", fontFamily: "var(--font-mono)" }}
        >
          {" "}
          Mengecek...{" "}
        </div>
      ) : (
        <div
          className="px-3 pb-2 text-[9px]"
          style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
        >
          {" "}
          {formatLastChecked(account.lastCheckedAt)}{" "}
        </div>
      )}{" "}
      <div className="px-3 pb-3 pt-1 space-y-2">
        {" "}
        <button
          onClick={() => onProxy(account)}
          className="w-full py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider"
          style={{
            background: account.proxyConfigured
              ? "rgba(34,197,94,0.08)"
              : "rgba(100,116,139,0.08)",
            border: account.proxyConfigured
              ? "1px solid rgba(34,197,94,0.25)"
              : "1px solid rgba(100,116,139,0.2)",
            color: account.proxyConfigured ? "#22c55e" : "#64748b",
            fontFamily: "var(--font-mono)",
          }}
        >
          {" "}
          {account.proxyConfigured ? "Proxy Terpasang" : "Atur Proxy"}{" "}
        </button>{" "}
        <button
          onClick={handleReply}
          disabled={replyBusy}
          className="w-full py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40"
          style={{
            background: "#3b82f618",
            border: "1px solid #3b82f640",
            color: "#60a5fa",
            fontFamily: "var(--font-mono)",
          }}
        >
          {" "}
          {replyBusy ? "Membuka..." : "Balas Sekarang"}{" "}
        </button>{" "}
      </div>{" "}
    </div>
  );
}
function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded"
      style={{ background: "#10141c", border: "1px solid #1e2436" }}
    >
      {" "}
      <span
        className="size-2 rounded-full flex-shrink-0"
        style={{ background: color }}
      />{" "}
      <span
        className="text-[11px] tabular-nums font-semibold"
        style={{ color, fontFamily: "var(--font-mono)" }}
      >
        {" "}
        {value}{" "}
      </span>{" "}
      <span
        className="text-[10px] tracking-wide uppercase"
        style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
      >
        {" "}
        {label}{" "}
      </span>{" "}
    </div>
  );
}
export default function App() {
  const [accounts, setAccounts] = useState<AccountStatusData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("unread");
  const [now, setNow] = useState(new Date());
  const [engineRunning, setEngineRunning] = useState(false);
  const [engineBusy, setEngineBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [proxyAccount, setProxyAccount] = useState<AccountStatusData | null>(
    null,
  );
  const [proxyImportBusy, setProxyImportBusy] = useState(false);
  const [rotation, setRotation] = useState<RotationState>({
    round: 0,
    currentBatch: [],
    checkedSoFar: 0,
    totalAccounts: 0,
  });
  const replaceAccounts = (data: AccountStatusData[]) => {
    setAccounts(data.map(mapApiAccount));
  };
  const updateAccount = (
    id: string,
    updates: { name?: string; city?: string },
  ) => {
    setAccounts((prev) =>
      prev.map((account) =>
        account.accountId === id ? { ...account, ...updates } : account,
      ),
    );
    window.api.updateAccount(id, updates).catch((err) => {
      setLogs((prev) => [
        ...prev,
        `[error] Gagal simpan perubahan akun: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    });
  };
  const replyNow = async (id: string) => {
    try {
      await window.api.openReplySession(id);
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        `[error] ${err instanceof Error ? err.message : String(err)}`,
      ]);
    }
  };
  const removeAccount = (id: string) => {
    window.api
      .removeAccount(id)
      .then(replaceAccounts)
      .catch((err) => {
        setLogs((prev) => [
          ...prev,
          `[error] ${err instanceof Error ? err.message : String(err)}`,
        ]);
      });
  };
  const importProxyCsv = async () => {
    setProxyImportBusy(true);
    try {
      const result = await window.api.importProxyCsv();
      if (result.cancelled) {
        return;
      }
      if (result.accounts) {
        replaceAccounts(result.accounts);
      }
      const parseErrorCount = result.parseErrors?.length ?? 0;
      const importErrorCount = result.errors?.length ?? 0;
      const totalErrors = parseErrorCount + importErrorCount;
      setLogs((prev) => [
        ...prev,
        `[success] Import proxy selesai: ${result.imported ?? 0} berhasil, ${totalErrors} gagal.`,
      ]);
      const allErrors = [
        ...(result.parseErrors ?? []),
        ...(result.errors ?? []),
      ];
      allErrors.slice(0, 10).forEach((error) => {
        setLogs((prev) => [
          ...prev,
          `[warn] ${error.accountId || "CSV"}${error.line ? ` (baris ${error.line})` : ""}: ${error.message}`,
        ]);
      });
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        `[error] Gagal import proxy: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    } finally {
      setProxyImportBusy(false);
    }
  };
  const startBot = async () => {
    setEngineBusy(true);
    try {
      const result = await window.api.startEngine();
      if (!result.started) {
        setEngineRunning(false);
        if (result.reason === "NO_ENABLED_ACCOUNTS") {
          setLogs((prev) => [
            ...prev,
            "[warn] Bot tidak dapat dimulai: tidak ada akun.",
          ]);
        }
        if (result.reason === "NO_ACCOUNTS") {
          setLogs((prev) => [
            ...prev,
            "[warn] Bot tidak dapat dimulai: belum ada profil akun.",
          ]);
        }
        return;
      }
      setEngineRunning(true);
    } catch (err) {
      setEngineRunning(false);
      setLogs((prev) => [
        ...prev,
        `[error] Gagal menjalankan bot: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    } finally {
      setEngineBusy(false);
    }
  };
  const stopBot = async () => {
    setEngineBusy(true);
    try {
      await window.api.stopEngine();
      setEngineRunning(false);
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        `[error] ${err instanceof Error ? err.message : String(err)}`,
      ]);
    } finally {
      setEngineBusy(false);
    }
  };
  useEffect(() => {
    window.api
      .getAccounts()
      .then(replaceAccounts)
      .catch((err) => {
        setLogs((prev) => [
          ...prev,
          `[error] Gagal membaca akun: ${err instanceof Error ? err.message : String(err)}`,
        ]);
      });
    window.api
      .getEngineStatus()
      .then((status) => setEngineRunning(status.running))
      .catch(() => {});
    const unsubscribeAccounts = window.api.onAccountsUpdate(replaceAccounts);
    const unsubscribeEngine = window.api.onEngineStatus(({ running }) =>
      setEngineRunning(running),
    );
    const unsubscribeRotation = window.api.onRotationUpdate(setRotation);
    window.api
      .getRotationState()
      .then(setRotation)
      .catch(() => {});
    const unsubscribeLogs = window.api.onEngineLog((entry) => {
      setLogs((prev) => [
        ...prev.slice(-49),
        `[${entry.level}] ${entry.message}`,
      ]);
    });
    return () => {
      unsubscribeAccounts();
      unsubscribeEngine();
      unsubscribeRotation();
      unsubscribeLogs();
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const counts = useMemo(() => {
    const displayed = accounts.map(mapToDisplayStatus);
    return {
      all: accounts.length,
      active: displayed.filter((status) => status === "active").length,
      sleeping: displayed.filter((status) => status === "sleeping").length,
      new: displayed.filter((status) => status === "new").length,
      error: displayed.filter((status) => status === "error").length,
      totalUnread: accounts.reduce(
        (sum, account) => sum + (account.unreadCount ?? 0),
        0,
      ),
    };
  }, [accounts]);
  const filtered = useMemo(() => {
    let list = accounts;
    if (statusFilter !== "all") {
      list = list.filter(
        (account) => mapToDisplayStatus(account) === statusFilter,
      );
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (account) =>
          account.name.toLowerCase().includes(query) ||
          account.accountId.toLowerCase().includes(query) ||
          (account.city ?? "").toLowerCase().includes(query),
      );
    }
    return [...list].sort((a, b) => {
      if (sortOrder === "unread") {
        return (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      }
      if (sortOrder === "name") {
        return a.name.localeCompare(b.name, "id");
      }
      return 0;
    });
  }, [accounts, statusFilter, searchQuery, sortOrder]);
  const timeStr = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateStr = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const filterTabs: { key: FilterStatus; label: string; color: string }[] = [
    { key: "all", label: "Semua", color: "#64748b" },
    { key: "active", label: "Aktif", color: "#22c55e" },
    { key: "sleeping", label: "Tidur", color: "#f59e0b" },
    { key: "new", label: "Baru", color: "#3b82f6" },
    { key: "error", label: "Error", color: "#ef4444" },
  ];
  const sortOptions: { key: SortOrder; label: string }[] = [
    { key: "unread", label: "Unread Terbanyak" },
    { key: "name", label: "Nama A–Z" },
    { key: "default", label: "Urutan Bawaan" },
  ];
  return (
    <div
      className="flex flex-col size-full overflow-hidden"
      style={{ background: "#0a0d12", fontFamily: "var(--font-sans)" }}
    >
      {" "}
      {/* HEADER */}{" "}
      <div
        className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid #1e2436", background: "#0d1017" }}
      >
        {" "}
        <div className="flex items-center gap-3">
          {" "}
          <span
            className="text-[13px] font-semibold"
            style={{ color: "#e2e8f0" }}
          >
            {" "}
            Bot Pemantau Marketplace{" "}
          </span>{" "}
          <span
            className="px-2 py-1 rounded text-[9px] uppercase tracking-widest"
            style={{
              background: engineRunning
                ? "rgba(34,197,94,0.1)"
                : "rgba(245,158,11,0.1)",
              color: engineRunning ? "#22c55e" : "#f59e0b",
              border: `1px solid ${engineRunning ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
              fontFamily: "var(--font-mono)",
            }}
          >
            {" "}
            {engineRunning ? "RUNNING" : "STOPPED"}{" "}
          </span>{" "}
        </div>{" "}
        <div className="flex items-center gap-2">
          {" "}
          <StatPill label="Aktif" value={counts.active} color="#22c55e" />{" "}
          <StatPill label="Tidur" value={counts.sleeping} color="#f59e0b" />{" "}
          {counts.error > 0 && (
            <StatPill label="Error" value={counts.error} color="#ef4444" />
          )}{" "}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded"
            style={{ background: "#10141c", border: "1px solid #1e2436" }}
          >
            {" "}
            <span
              className="size-2 rounded-full"
              style={{
                background: counts.totalUnread > 0 ? "#ef4444" : "#374151",
              }}
            />{" "}
            <span
              className="text-[11px] tabular-nums font-semibold"
              style={{
                color: counts.totalUnread > 0 ? "#ef4444" : "#374151",
                fontFamily: "var(--font-mono)",
              }}
            >
              {" "}
              {counts.totalUnread}{" "}
            </span>{" "}
            <span
              className="text-[10px] tracking-wide uppercase"
              style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              UNREAD{" "}
            </span>{" "}
          </div>{" "}
        </div>{" "}
        <div className="flex items-center gap-3">
          {" "}
          <button
            onClick={() => setShowAddAccount(true)}
            disabled={engineBusy || proxyImportBusy}
            className="px-3 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40"
            style={{
              background: "#3b82f618",
              border: "1px solid #3b82f640",
              color: "#60a5fa",
              fontFamily: "var(--font-mono)",
            }}
          >
            {" "}
            + Profil{" "}
          </button>{" "}
          <button
            onClick={importProxyCsv}
            disabled={engineBusy || proxyImportBusy}
            className="px-3 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40"
            style={{
              background: "#8b5cf618",
              border: "1px solid #8b5cf640",
              color: "#a78bfa",
              fontFamily: "var(--font-mono)",
            }}
          >
            {" "}
            {proxyImportBusy ? "Import..." : "Import Proxy"}{" "}
          </button>{" "}
          <button
            disabled={engineBusy || engineRunning}
            onClick={startBot}
            className="px-3 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40"
            style={{
              background: "#22c55e18",
              border: "1px solid #22c55e40",
              color: "#22c55e",
              fontFamily: "var(--font-mono)",
            }}
          >
            {" "}
            Start{" "}
          </button>{" "}
          <button
            disabled={engineBusy || !engineRunning}
            onClick={stopBot}
            className="px-3 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-40"
            style={{
              background: "#ef444418",
              border: "1px solid #ef444440",
              color: "#ef4444",
              fontFamily: "var(--font-mono)",
            }}
          >
            {" "}
            Stop{" "}
          </button>{" "}
          <div className="flex flex-col items-end">
            {" "}
            <span
              className="text-[13px] tabular-nums font-medium"
              style={{ color: "#64748b", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              {timeStr}{" "}
            </span>{" "}
            <span
              className="text-[9px]"
              style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              {dateStr}{" "}
            </span>{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
      {/* FILTER BAR */}{" "}
      <div
        className="flex items-center gap-3 px-6 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid #1e2436", background: "#0d1017" }}
      >
        {" "}
        <div className="flex items-center gap-1">
          {" "}
          {filterTabs.map((tab) => {
            const count =
              tab.key === "all"
                ? counts.all
                : Number(counts[tab.key as keyof typeof counts]);
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium tracking-wide"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: active ? `${tab.color}18` : "transparent",
                  border: `1px solid ${active ? `${tab.color}40` : "#1e2436"}`,
                  color: active ? tab.color : "#374151",
                }}
              >
                {" "}
                {tab.label} ( {count}){" "}
              </button>
            );
          })}{" "}
        </div>{" "}
        <div className="w-px h-5" style={{ background: "#1e2436" }} />{" "}
        <div className="relative flex-1 max-w-xs">
          {" "}
          <input
            type="text"
            placeholder="Cari nama atau ID akun..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full px-3 py-1.5 rounded text-[11px] outline-none"
            style={{
              background: "#10141c",
              border: "1px solid #1e2436",
              color: "#e2e8f0",
              fontFamily: "var(--font-mono)",
            }}
          />{" "}
        </div>{" "}
        <div className="w-px h-5" style={{ background: "#1e2436" }} />{" "}
        <div className="flex items-center gap-1.5">
          {" "}
          <span
            className="text-[9px] uppercase"
            style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
          >
            {" "}
            Urutkan:{" "}
          </span>{" "}
          {sortOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => setSortOrder(option.key)}
              className="px-2 py-1 rounded text-[9px]"
              style={{
                fontFamily: "var(--font-mono)",
                background:
                  sortOrder === option.key
                    ? "rgba(59,130,246,0.12)"
                    : "transparent",
                border: `1px solid ${sortOrder === option.key ? "rgba(59,130,246,0.3)" : "#1e2436"}`,
                color: sortOrder === option.key ? "#60a5fa" : "#374151",
              }}
            >
              {" "}
              {option.label}{" "}
            </button>
          ))}{" "}
        </div>{" "}
        <div
          className="ml-auto text-[9px]"
          style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
        >
          {" "}
          {filtered.length} akun{" "}
        </div>{" "}
      </div>{" "}
      {/* ACCOUNT GRID */}{" "}
      <div className="flex-1 overflow-y-auto p-5">
        {" "}
        {accounts.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-[11px] uppercase tracking-widest"
            style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
          >
            {" "}
            Memuat data akun...{" "}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-[11px] uppercase tracking-widest"
            style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
          >
            {" "}
            Tidak ada akun ditemukan{" "}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
              gap: "12px",
            }}
          >
            {" "}
            {filtered.map((account) => (
              <AccountCard
                key={account.accountId}
                account={account}
                isChecking={rotation.currentBatch.includes(account.accountId)}
                onRemove={removeAccount}
                onUpdate={updateAccount}
                onReply={replyNow}
                onProxy={setProxyAccount}
              />
            ))}{" "}
          </div>
        )}{" "}
      </div>{" "}
      {/* FOOTER */}{" "}
      <div
        className="flex items-center justify-between px-6 py-2 flex-shrink-0"
        style={{ borderTop: "1px solid #1e2436", background: "#0d1017" }}
      >
        {" "}
        <div className="flex items-center gap-4">
          {" "}
          <div className="flex items-center gap-1.5">
            {" "}
            <span
              className="size-1.5 rounded-full"
              style={{ background: engineRunning ? "#22c55e" : "#f59e0b" }}
            />{" "}
            <span
              className="text-[9px] tracking-widest uppercase"
              style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              {engineRunning ? "Sistem berjalan" : "Sistem dihentikan"}{" "}
            </span>{" "}
          </div>{" "}
          {rotation.totalAccounts > 0 && (
            <span
              className="text-[9px]"
              style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              Putaran # {rotation.round} — {rotation.checkedSoFar} /{" "}
              {rotation.totalAccounts} akun dicek{" "}
            </span>
          )}{" "}
          {rotation.currentBatch.length > 0 && (
            <span
              className="text-[9px] truncate max-w-md"
              style={{ color: "#3b82f6", fontFamily: "var(--font-mono)" }}
            >
              {" "}
              Sedang cek: {rotation.currentBatch.join(", ")}{" "}
            </span>
          )}{" "}
        </div>{" "}
        <span
          className="text-[9px]"
          style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
        >
          {" "}
          Log: {logs.length}{" "}
        </span>{" "}
      </div>{" "}
      {/* ADD ACCOUNT MODAL */}{" "}
      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onCreated={replaceAccounts}
        />
      )}{" "}
      {/* PROXY MODAL */}{" "}
      {proxyAccount && (
        <ProxyModal
          account={proxyAccount}
          onClose={() => setProxyAccount(null)}
          onSaved={(updated) => {
            setAccounts((prev) =>
              prev.map((account) =>
                account.accountId === updated.accountId
                  ? { ...account, ...updated }
                  : account,
              ),
            );
            setProxyAccount(null);
          }}
        />
      )}{" "}
    </div>
  );
}
