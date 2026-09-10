import { useState, useEffect, useMemo } from "react";

type AccountStatus = "active" | "sleeping" | "new" | "error";
type SortOrder = "unread" | "name" | "default";
type FilterStatus = "all" | AccountStatus;

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

function mapToDisplayStatus(a: AccountStatusData): AccountStatus {
  if (a.state === "error") return "error";
  if (a.state === "starting" || a.state === "idle") return "new";
  if (a.state === "offline" || a.state === "stopped") return "sleeping";
  if (a.lastCheckedAt) {
    const age = Date.now() - new Date(a.lastCheckedAt).getTime();
    if (age > STALE_THRESHOLD_MS) return "sleeping";
  }
  return "active";
}

function formatLastChecked(iso: string | null): string {
  if (!iso) return "Belum pernah dicek";
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  return `${Math.floor(mins / 60)} jam lalu`;
}

function warningFor(
  a: AccountStatusData,
  display: AccountStatus,
): string | null {
  if (display === "error") return a.error || "Terjadi kesalahan";
  if (a.state === "offline") return "Sesi login belum tersedia";
  if (display === "new") return "Menunggu pengecekan...";
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
      <span
        className={`size-1.5 rounded-full ${pulse ? "pulse-dot" : ""}`}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function AccountCard({
  account,
  isChecking,
  onRemove,
  onUpdate,
  onReply,
}: {
  account: AccountStatusData;
  isChecking: boolean;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: { name?: string; city?: string }) => void;
  onReply: (id: string) => void;
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
    if (trimmed && trimmed !== account.name)
      onUpdate(account.accountId, { name: trimmed });
    else setNameDraft(account.name);
  };

  const saveCity = () => {
    setEditingCity(false);
    if (cityDraft.trim() !== (account.city ?? ""))
      onUpdate(account.accountId, { city: cityDraft.trim() });
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
      <button
        onClick={() => onRemove(account.accountId)}
        className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center size-5 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "#1e2436", color: "#64748b" }}
        title="Hapus akun"
      >
        ×
      </button>

      <div
        className="flex items-center gap-2 px-3 pt-3 pb-2"
        style={{ borderBottom: "1px solid #1e2436", background: "#10141c" }}
      >
        <div
          className="flex items-center justify-center size-7 rounded text-[11px] font-semibold flex-shrink-0"
          style={{
            background: `${headerAccent}18`,
            color: headerAccent,
            fontFamily: "var(--font-mono)",
          }}
        >
          {account.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
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
              {account.name}
            </div>
          )}
          <div
            className="text-[9px] truncate"
            style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
          >
            {account.accountId}
          </div>

          {editingCity ? (
            <input
              autoFocus
              value={cityDraft}
              placeholder="Kota promosi..."
              onChange={(e) => setCityDraft(e.target.value)}
              onBlur={saveCity}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
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
              📍 {account.city || "Set kota..."}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <StatusBadge status={display} />
        <div className="flex items-center gap-1">
          <span
            className="size-1.5 rounded-full"
            style={{ background: unreadCount > 0 ? "#ef4444" : "#374151" }}
          />
          <span
            className="text-[11px] tabular-nums font-semibold"
            style={{
              color: unreadCount > 0 ? "#ef4444" : "#374151",
              fontFamily: "var(--font-mono)",
            }}
          >
            {unreadCount}
          </span>
        </div>
      </div>

      {warning && (
        <div
          className="px-3 pb-2 text-[9px]"
          style={{ color: "#f59e0b", fontFamily: "var(--font-mono)" }}
        >
          ⚠ {warning}
        </div>
      )}

      {isChecking ? (
        <div
          className="px-3 pb-2 text-[9px]"
          style={{ color: "#3b82f6", fontFamily: "var(--font-mono)" }}
        >
          Mengecek...
        </div>
      ) : (
        <div
          className="px-3 pb-2 text-[9px]"
          style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
        >
          {formatLastChecked(account.lastCheckedAt)}
        </div>
      )}

      <div className="px-3 pb-3 pt-1">
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
          {replyBusy ? "Membuka..." : "Balas Sekarang"}
        </button>
      </div>
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
      <span
        className="size-2 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <span
        className="text-[11px] tabular-nums font-semibold"
        style={{ color, fontFamily: "var(--font-mono)" }}
      >
        {value}
      </span>
      <span
        className="text-[10px] tracking-wide uppercase"
        style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
      >
        {label}
      </span>
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
  const [rotation, setRotation] = useState<RotationState>({ round: 0, currentBatch: [], checkedSoFar: 0, totalAccounts: 0 });
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

  useEffect(() => {
    window.api
      .getAccounts()
      .then((data) => {
        setAccounts(
          data.map((account) => ({
            accountId: account.accountId,
            name: account.name,
            city: account.city ?? "",
            enabled: account.enabled,
            state: account.state,
            loggedIn: account.loggedIn,
            unreadCount: account.unreadCount,
            lastCheckedAt: account.lastCheckedAt,
            error: account.error,
          })),
        );
      })
      .catch((err) => {
        setLogs((prev) => [...prev, `Gagal membaca akun: ${err.message}`]);
      });
    window.api
      .getEngineStatus()
      .then((s) => setEngineRunning(s.running))
      .catch(() => {});

    const unsubscribeAccounts = window.api.onAccountsUpdate((data) => {
      setAccounts(
        data.map((account) => ({
          accountId: account.accountId,
          name: account.name,
          city: account.city ?? "",
          enabled: account.enabled,
          state: account.state,
          loggedIn: account.loggedIn,
          unreadCount: account.unreadCount,
          lastCheckedAt: account.lastCheckedAt,
          error: account.error,
        })),
      );
    });
    const unsubscribeEngine = window.api.onEngineStatus(({ running }) =>
      setEngineRunning(running),
    );
    const unsubscribeRotation = window.api.onRotationUpdate(setRotation);
    window.api.getRotationState().then(setRotation).catch(() => {});
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
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const startBot = async () => {
    setEngineBusy(true);
    try {
      await window.api.startEngine();
      setEngineRunning(true);
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        `[error] ${err instanceof Error ? err.message : String(err)}`,
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

  const removeAccount = (id: string) => {
    window.api
      .removeAccount(id)
      .then((data) => {
        setAccounts(
          data.map((account) => ({
            accountId: account.accountId,
            name: account.name,
            city: account.city ?? "",
            enabled: account.enabled,
            state: account.state,
            loggedIn: account.loggedIn,
            unreadCount: account.unreadCount,
            lastCheckedAt: account.lastCheckedAt,
            error: account.error,
          })),
        );
      })
      .catch((err) => {
        setLogs((prev) => [...prev, `[error] ${err.message}`]);
      });
  };

  const counts = useMemo(() => {
    const displayed = accounts.map(mapToDisplayStatus);
    return {
      all: accounts.length,
      active: displayed.filter((s) => s === "active").length,
      sleeping: displayed.filter((s) => s === "sleeping").length,
      new: displayed.filter((s) => s === "new").length,
      error: displayed.filter((s) => s === "error").length,
      totalUnread: accounts.reduce((sum, a) => sum + (a.unreadCount ?? 0), 0),
    };
  }, [accounts]);

  const filtered = useMemo(() => {
    let list = accounts;
    if (statusFilter !== "all")
      list = list.filter((a) => mapToDisplayStatus(a) === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.accountId.toLowerCase().includes(q) ||
          (a.city ?? "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (sortOrder === "unread")
        return (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      if (sortOrder === "name") return a.name.localeCompare(b.name, "id");
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
      <div
        className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid #1e2436", background: "#0d1017" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-[13px] font-semibold"
            style={{ color: "#e2e8f0" }}
          >
            Bot Pemantau Marketplace
          </span>
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
            {engineRunning ? "RUNNING" : "STOPPED"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <StatPill label="Aktif" value={counts.active} color="#22c55e" />
          <StatPill label="Tidur" value={counts.sleeping} color="#f59e0b" />
          {counts.error > 0 && (
            <StatPill label="Error" value={counts.error} color="#ef4444" />
          )}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded"
            style={{ background: "#10141c", border: "1px solid #1e2436" }}
          >
            <span
              className="size-2 rounded-full"
              style={{
                background: counts.totalUnread > 0 ? "#ef4444" : "#374151",
              }}
            />
            <span
              className="text-[11px] tabular-nums font-semibold"
              style={{
                color: counts.totalUnread > 0 ? "#ef4444" : "#374151",
                fontFamily: "var(--font-mono)",
              }}
            >
              {counts.totalUnread}
            </span>
            <span
              className="text-[10px] tracking-wide uppercase"
              style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
            >
              UNREAD
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
            Start
          </button>
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
            Stop
          </button>
          <div className="flex flex-col items-end">
            <span
              className="text-[13px] tabular-nums font-medium"
              style={{ color: "#64748b", fontFamily: "var(--font-mono)" }}
            >
              {timeStr}
            </span>
            <span
              className="text-[9px]"
              style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
            >
              {dateStr}
            </span>
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-3 px-6 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid #1e2436", background: "#0d1017" }}
      >
        <div className="flex items-center gap-1">
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
                {tab.label} <span>({count})</span>
              </button>
            );
          })}
        </div>
        <div className="w-px h-5" style={{ background: "#1e2436" }} />
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Cari nama atau ID akun..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 rounded text-[11px] outline-none"
            style={{
              background: "#10141c",
              border: "1px solid #1e2436",
              color: "#e2e8f0",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>
        <div className="w-px h-5" style={{ background: "#1e2436" }} />
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] uppercase"
            style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
          >
            Urutkan:
          </span>
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortOrder(opt.key)}
              className="px-2 py-1 rounded text-[9px]"
              style={{
                fontFamily: "var(--font-mono)",
                background:
                  sortOrder === opt.key
                    ? "rgba(59,130,246,0.12)"
                    : "transparent",
                border: `1px solid ${sortOrder === opt.key ? "rgba(59,130,246,0.3)" : "#1e2436"}`,
                color: sortOrder === opt.key ? "#60a5fa" : "#374151",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div
          className="ml-auto text-[9px]"
          style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
        >
          {filtered.length} akun
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {accounts.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-[11px] uppercase tracking-widest"
            style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
          >
            Memuat data akun...
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-[11px] uppercase tracking-widest"
            style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
          >
            Tidak ada akun ditemukan
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
              gap: "12px",
            }}
          >
            {filtered.map((account) => (
              <AccountCard
                key={account.accountId}
                account={account}
                isChecking={rotation.currentBatch.includes(account.accountId)}
                onRemove={removeAccount}
                onUpdate={updateAccount}
                onReply={replyNow}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="flex items-center justify-between px-6 py-2 flex-shrink-0"
        style={{ borderTop: "1px solid #1e2436", background: "#0d1017" }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ background: engineRunning ? "#22c55e" : "#f59e0b" }}
            />
            <span
              className="text-[9px] tracking-widest uppercase"
              style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
            >
              {engineRunning ? "Sistem berjalan" : "Sistem dihentikan"}
            </span>
          </div>
          {rotation.totalAccounts > 0 && (
            <span
              className="text-[9px]"
              style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
            >
              Putaran #{rotation.round} — {rotation.checkedSoFar}/{rotation.totalAccounts} akun dicek
            </span>
          )}
          {rotation.currentBatch.length > 0 && (
            <span
              className="text-[9px] truncate max-w-md"
              style={{ color: "#3b82f6", fontFamily: "var(--font-mono)" }}
            >
              Sedang cek: {rotation.currentBatch.join(", ")}
            </span>
          )}
        </div>
        <span
          className="text-[9px]"
          style={{ color: "#374151", fontFamily: "var(--font-mono)" }}
        >
          Log: {logs.length}
        </span>
      </div>
    </div>
  );
}
