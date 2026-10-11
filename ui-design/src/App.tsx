import { useEffect, useMemo, useRef, useState } from "react";

type AccountStatus = "active" | "sleeping" | "new" | "error";
type SortOrder = "unread" | "name" | "default" | "post-desc" | "post-asc";
type FilterStatus = "all" | AccountStatus;

const STALE_THRESHOLD_MS = 15 * 60 * 1000;
const CARD_MIN_WIDTH = 200;
const GRID_GAP = 12;

const palette = {
  border: "#27272A",
  borderStrong: "#3F3F46",
  text: "#FFFFFF",
  textSecondary: "#A1A1AA",
  textMuted: "#71717A",
  accent: "#34D399",
  accentSoft: "rgba(52,211,153,0.12)",
  green: "#34D399",
  amber: "#FBBF24",
  red: "#F87171",
  card: "#18181B",
  bg: "#020804",
  fontDisplay: "Inter, system-ui, sans-serif",
} as const;

const statusConfig: Record<
  AccountStatus,
  { label: string; color: string }
> = {
  active: { label: "Aktif", color: palette.green },
  sleeping: { label: "Tidur", color: palette.amber },
  new: { label: "Baru", color: palette.textSecondary },
  error: { label: "Error", color: palette.red },
};

function mapApiAccount(account: AccountStatusData): AccountStatusData {
  return {
    accountId: account.accountId,
    name: account.name,
    city: account.city ?? "",
    postCount: account.postCount ?? null,
    enabled: account.enabled,
    state: account.state,
    loggedIn: account.loggedIn,
    unreadCount: account.unreadCount,
    lastCheckedAt: account.lastCheckedAt,
    error: account.error,
  };
}

function mapToDisplayStatus(account: AccountStatusData): AccountStatus {
  if (account.state === "error") return "error";
  if (account.state === "starting" || account.state === "idle") return "new";
  if (account.state === "offline" || account.state === "stopped")
    return "sleeping";
  if (account.lastCheckedAt) {
    const age = Date.now() - new Date(account.lastCheckedAt).getTime();
    if (age > STALE_THRESHOLD_MS) return "sleeping";
  }
  return "active";
}

function formatLastChecked(iso: string | null): string {
  if (!iso) return "Belum pernah dicek";
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Dicek baru saja";
  if (mins < 60) return `Dicek ${mins} menit lalu`;
  return `Dicek ${Math.floor(mins / 60)} jam lalu`;
}

function warningFor(
  account: AccountStatusData,
  display: AccountStatus,
): string | null {
  if (display === "error") {
    return account.error || "Terjadi kesalahan";
  }
  if (account.state === "offline") {
    // Sesi kadaluarsa / akun ditangguhkan / banned -- alasan spesifik
    // dikirim dari rotator (checkUnread.js: describeUnusable).
    return account.error || "Sesi login belum tersedia";
  }
  if (display === "new") {
    return "Menunggu pengecekan";
  }
  return null;
}

function StatusDot({ status }: { status: AccountStatus }) {
  const { label, color } = statusConfig[status];
  return (
    <span className="flex items-center gap-1.5 text-[12px]">
      <span
        className="inline-block size-2 rounded-full"
        style={{ background: color }}
      />
      <span style={{ color }}>{label}</span>
    </span>
  );
}

// --- Modal tambah akun -----------------------------------------------------
// ↑/↓ pindah antar kolom, Enter menyimpan (form submit).

const MODAL_FIELDS = 4;

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
  const [postCount, setPostCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fieldRefs = useRef<(HTMLInputElement | null)[]>([]);

  const moveFocus = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (index + step + MODAL_FIELDS) % MODAL_FIELDS;
    fieldRefs.current[next]?.focus();
  };

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
        postCount: postCount.trim() === "" ? null : Number(postCount),
      });
      onCreated(accounts);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const labelStyle = {
    display: "block",
    fontSize: 13,
    color: palette.textSecondary,
    marginBottom: 4,
  } as const;

  const inputStyle = {
    width: "100%",
    padding: "7px 10px",
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${palette.borderStrong}`,
    background: palette.card,
    color: palette.text,
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <form
        className="w-full max-w-sm rounded-lg p-5"
        style={{
          background: palette.card,
          border: `1px solid ${palette.border}`,
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void submit();
        }}
      >
        <div className="mb-4">
          <div
            className="text-[15px] font-semibold"
            style={{ fontFamily: palette.fontDisplay }}
          >
            Tambah Akun
          </div>
          <div className="text-[12px]" style={{ color: palette.textMuted }}>
            Profil dibuat tanpa membuka browser.
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label style={labelStyle} htmlFor="field-account-id">
              Account ID
            </label>
            <input
              id="field-account-id"
              autoFocus
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              onKeyDown={(event) => moveFocus(event, 0)}
              ref={(el) => {
                fieldRefs.current[0] = el;
              }}
              placeholder="akun-003"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="field-name">
              Nama akun
            </label>
            <input
              id="field-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => moveFocus(event, 1)}
              ref={(el) => {
                fieldRefs.current[1] = el;
              }}
              placeholder="Toko Kediri"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="field-city">
              Kota
            </label>
            <input
              id="field-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              onKeyDown={(event) => moveFocus(event, 2)}
              ref={(el) => {
                fieldRefs.current[2] = el;
              }}
              placeholder="Kediri"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="field-post-count">
              Jumlah postingan (opsional)
            </label>
            <input
              id="field-post-count"
              type="number"
              min={0}
              value={postCount}
              onChange={(event) => setPostCount(event.target.value)}
              onKeyDown={(event) => moveFocus(event, 3)}
              ref={(el) => {
                fieldRefs.current[3] = el;
              }}
              placeholder="12"
              style={inputStyle}
            />
            <div
              className="mt-1 text-[11px]"
              style={{ color: palette.textMuted }}
            >
              Boleh dikosongkan. Isi 0 kalau memang belum ada postingan.
            </div>
          </div>

          {error && (
            <div
              className="rounded px-3 py-2 text-[12px]"
              style={{
                background: "rgba(248,113,113,0.12)",
                border: "1px solid rgba(248,113,113,0.35)",
                color: palette.red,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded px-3 py-1.5 text-[13px] disabled:opacity-50"
            style={{
              background: "transparent",
              border: `1px solid ${palette.borderStrong}`,
              color: palette.textSecondary,
            }}
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            style={{ background: palette.accent }}
          >
            {busy ? "Menyimpan..." : "Tambahkan"}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Kartu akun -------------------------------------------------------------

function AccountCard({
  account,
  selected,
  isChecking,
  onSelect,
  onRemove,
  onUpdate,
  onReply,
  onContextMenu,
}: {
  account: AccountStatusData;
  selected: boolean;
  isChecking: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: { name?: string; city?: string; postCount?: number | null }) => void;
  onReply: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, id: string) => void;
}) {
  const display = mapToDisplayStatus(account);
  const unreadCount = account.unreadCount ?? 0;
  const [editingName, setEditingName] = useState(false);
  const [editingCity, setEditingCity] = useState(false);
  const [editingPostCount, setEditingPostCount] = useState(false);
  const [nameDraft, setNameDraft] = useState(account.name);
  const [cityDraft, setCityDraft] = useState(account.city ?? "");
  const [postCountDraft, setPostCountDraft] = useState(
    account.postCount === null ? "" : String(account.postCount),
  );
  const [replyBusy, setReplyBusy] = useState(false);

  const warning = warningFor(account, display);

  // Border "menyala" mengikuti status: hijau = aktif, merah = error.
  const statusBorderColor =
    display === "error"
      ? palette.red
      : display === "active" || isChecking
        ? palette.accent
        : palette.border;
  const statusGlow =
    display === "error"
      ? "0 0 10px rgba(248,113,113,0.25)"
      : display === "active"
        ? "0 0 10px rgba(52,211,153,0.2)"
        : undefined;

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

  const savePostCount = () => {
    setEditingPostCount(false);
    const raw = postCountDraft.trim();
    if (raw === "") {
      if (account.postCount !== null) {
        onUpdate(account.accountId, { postCount: null });
      }
      return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setPostCountDraft(
        account.postCount === null ? "" : String(account.postCount),
      );
      return;
    }
    if (parsed !== account.postCount) {
      onUpdate(account.accountId, { postCount: parsed });
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

  const lineStyle = {
    fontSize: 12,
    color: palette.textSecondary,
    cursor: "text",
  } as const;

  const smallInputStyle = {
    width: "100%",
    fontSize: 12,
    padding: "1px 5px",
    borderRadius: 4,
    border: `1px solid ${palette.accent}`,
    color: palette.text,
    marginTop: 2,
  } as const;

  return (
    <div
      data-account-id={account.accountId}
      onClick={() => onSelect(account.accountId)}
      onContextMenu={(event) => onContextMenu(event, account.accountId)}
      className="card-hover group relative flex flex-col rounded-lg p-3"
      style={{
        background: palette.card,
        border: `1px solid ${statusBorderColor}`,
        boxShadow: `0 4px 16px rgba(0,0,0,0.35)${
          statusGlow ? `, ${statusGlow}` : ""
        }`,
        outline: selected && !isChecking ? `1px solid ${palette.accent}` : undefined,
      }}
    >
      <button
        onClick={(event) => {
          event.stopPropagation();
          onRemove(account.accountId);
        }}
        className="absolute top-2 right-2 hidden size-5 items-center justify-center rounded text-[13px] group-hover:flex"
        style={{ color: palette.textMuted }}
        title="Hapus akun"
      >
        ×
      </button>

      {editingName ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          className="w-full rounded pr-6 text-[14px] font-semibold"
          style={smallInputStyle}
        />
      ) : (
        <div
          className="truncate pr-6 text-[14px] font-semibold"
          style={{ color: palette.text, cursor: "text", fontFamily: palette.fontDisplay }}
          onClick={() => setEditingName(true)}
          title="Klik untuk edit nama"
        >
          {account.name}
        </div>
      )}

      <div className="truncate text-[11px]" style={{ color: palette.textMuted }}>
        {account.accountId}
      </div>

      <div className="mt-2 space-y-0.5">
        Kota:{" "}
        {editingCity ? (
          <input
            autoFocus
            value={cityDraft}
            placeholder="belum diatur"
            onChange={(event) => setCityDraft(event.target.value)}
            onBlur={saveCity}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            style={smallInputStyle}
          />
        ) : (
          <span style={lineStyle} onClick={() => setEditingCity(true)}>
            {account.city || "klik untuk isi"}
          </span>
        )}
      </div>

      <div style={lineStyle}>
        Postingan:{" "}
        {editingPostCount ? (
          <input
            autoFocus
            type="number"
            min={0}
            value={postCountDraft}
            placeholder="klik untuk isi"
            onChange={(event) => setPostCountDraft(event.target.value)}
            onBlur={savePostCount}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            style={smallInputStyle}
          />
        ) : (
          <span
            style={{
              ...lineStyle,
              color:
                account.postCount === null ? palette.textMuted : palette.accent,
            }}
            onClick={() => setEditingPostCount(true)}
          >
            {account.postCount === null
              ? "klik untuk isi"
              : `${account.postCount} postingan`}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <StatusDot status={display} />
        {unreadCount > 0 && (
          <span className="text-[12px] font-medium" style={{ color: palette.red }}>
            {unreadCount} belum dibaca
          </span>
        )}
      </div>

      {warning && (
        <div className="mt-1 text-[11px]" style={{ color: palette.amber }}>
          {warning}
        </div>
      )}

      {isChecking ? (
        <div className="mt-1 text-[11px]" style={{ color: palette.accent }}>
          Mengecek...
        </div>
      ) : (
        <div className="mt-1 text-[11px]" style={{ color: palette.textMuted }}>
          {formatLastChecked(account.lastCheckedAt)}
        </div>
      )}

      <button
        onClick={(event) => {
          event.stopPropagation();
          void handleReply();
        }}
        disabled={replyBusy}
        className="mt-3 w-full rounded py-1.5 text-[12px] disabled:opacity-50"
        style={
          display === "error"
            ? {
                background: "rgba(248,113,113,0.1)",
                border: `1px solid ${palette.red}`,
                color: palette.red,
              }
            : account.state === "offline"
              ? {
                  background: "rgba(251,191,36,0.1)",
                  border: `1px solid ${palette.amber}`,
                  color: palette.amber,
                }
              : {
                  background: palette.accentSoft,
                  border: `1px solid ${palette.border}`,
                  color: palette.accent,
                }
        }
      >
        {replyBusy
          ? "Membuka..."
          : display === "error" || account.state === "offline"
            ? "Login Ulang"
            : "Balas Sekarang"}
      </button>
    </div>
  );
}

// --- Aplikasi ---------------------------------------------------------------

export default function App() {
  const [accounts, setAccounts] = useState<AccountStatusData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("unread");
  const [engineRunning, setEngineRunning] = useState(false);
  const [engineBusy, setEngineBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    accountId: string;
  } | null>(null);
  const [rotation, setRotation] = useState<RotationState>({
    round: 0,
    currentBatch: [],
    checkedSoFar: 0,
    totalAccounts: 0,
  });

  const gridRef = useRef<HTMLDivElement>(null);

  const replaceAccounts = (data: AccountStatusData[]) => {
    setAccounts(data.map(mapApiAccount));
  };

  const reportError = (err: unknown) => {
    setErrorText(err instanceof Error ? err.message : String(err));
  };

  const updateAccount = (
    id: string,
    updates: { name?: string; city?: string; postCount?: number | null },
  ) => {
    setAccounts((prev) =>
      prev.map((account) =>
        account.accountId === id ? { ...account, ...updates } : account,
      ),
    );
    window.api.updateAccount(id, updates).catch(reportError);
  };

  const replyNow = async (id: string) => {
    try {
      await window.api.openReplySession(id);
    } catch (err) {
      reportError(err);
    }
  };

  const removeAccount = (id: string) => {
    window.api.removeAccount(id).then(replaceAccounts).catch(reportError);
  };

  const startBot = async () => {
    setEngineBusy(true);
    try {
      const result = await window.api.startEngine();
      if (!result.started) {
        setEngineRunning(false);
        if (result.reason === "NO_ACCOUNTS") {
          setErrorText("Bot tidak dapat dimulai: belum ada profil akun.");
        }
        return;
      }
      setEngineRunning(true);
    } catch (err) {
      setEngineRunning(false);
      reportError(err);
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
      reportError(err);
    } finally {
      setEngineBusy(false);
    }
  };

  // Muat data awal + pasang listener IPC.
  useEffect(() => {
    window.api.getAccounts().then(replaceAccounts).catch(reportError);
    window.api
      .getEngineStatus()
      .then((status) => setEngineRunning(status.running))
      .catch(() => {});

    const unsubscribeAccounts = window.api.onAccountsUpdate(replaceAccounts);
    const unsubscribeEngine = window.api.onEngineStatus(({ running }) =>
      setEngineRunning(running),
    );
    const unsubscribeRotation = window.api.onRotationUpdate(setRotation);
    window.api.getRotationState().then(setRotation).catch(() => {});
    const unsubscribeLogs = window.api.onEngineLog((entry) => {
      if (entry.level === "error") setErrorText(entry.message);
    });

    return () => {
      unsubscribeAccounts();
      unsubscribeEngine();
      unsubscribeRotation();
      unsubscribeLogs();
    };
  }, []);

  // Tutup menu klik-kanan kalau klik di tempat lain / Escape / window blur.
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("click", dismiss);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", dismiss);
    };
  }, [contextMenu]);

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
      if (sortOrder === "unread") return (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      if (sortOrder === "name") return a.name.localeCompare(b.name, "id");
      if (sortOrder === "post-desc") {
        // Belum diisi (null) ditaruh paling bawah.
        return (b.postCount ?? -1) - (a.postCount ?? -1);
      }
      if (sortOrder === "post-asc") {
        return (
          (a.postCount ?? Number.MAX_SAFE_INTEGER) -
          (b.postCount ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return 0;
    });
  }, [accounts, statusFilter, searchQuery, sortOrder]);

  // Keyboard grid: panah pindah kartu (2D), Enter = Balas Sekarang.
  useEffect(() => {
    if (showAddAccount) return;

    const columnCount = () => {
      const width = gridRef.current?.clientWidth ?? 0;
      return Math.max(1, Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Enter") {
        if (!selectedId) return;
        event.preventDefault();
        void replyNow(selectedId);
        return;
      }

      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        return;
      }
      if (filtered.length === 0) return;

      event.preventDefault();
      const columns = columnCount();
      const current = filtered.findIndex((a) => a.accountId === selectedId);
      const step =
        event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowDown"
              ? columns
              : -columns;
      const next = Math.min(
        filtered.length - 1,
        Math.max(0, (current === -1 ? 0 : current) + step),
      );
      const nextId = filtered[next]?.accountId;
      if (!nextId) return;
      setSelectedId(nextId);
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-account-id="${CSS.escape(nextId)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, selectedId, showAddAccount]);

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

  const filterTabs: { key: FilterStatus; label: string }[] = [
    { key: "all", label: "Semua" },
    { key: "active", label: "Aktif" },
    { key: "sleeping", label: "Tidur" },
    { key: "new", label: "Baru" },
    { key: "error", label: "Error" },
  ];

  const menuItemStyle = {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    padding: "7px 10px",
    fontSize: 13,
    borderRadius: 4,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: palette.text,
  };

  return (
    <div className="flex size-full flex-col overflow-hidden">
      {/* Header */}
      <header
        className="flex flex-shrink-0 items-center gap-4 px-5 py-3"
        style={{ borderBottom: `1px solid ${palette.border}`, background: palette.bg }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[15px] font-semibold"
            style={{ fontFamily: palette.fontDisplay }}
          >
            Bot Pemantau Marketplace
          </span>
          <span className="flex items-center gap-1.5 text-[13px]">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: engineRunning ? palette.green : palette.textMuted }}
            />
            <span style={{ color: palette.textSecondary }}>
              {engineRunning ? "Berjalan" : "Berhenti"}
            </span>
          </span>
        </div>

        <div className="text-[13px]" style={{ color: palette.textSecondary }}>
          {counts.active} aktif · {counts.sleeping} tidur ·{" "}
          <span style={{ color: counts.totalUnread > 0 ? palette.red : undefined }}>
            {counts.totalUnread} belum dibaca
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowAddAccount(true)}
            disabled={engineBusy}
            className="rounded px-3 py-1.5 text-[13px] disabled:opacity-50"
            style={{
              background: "transparent",
              border: `1px solid ${palette.borderStrong}`,
              color: palette.text,
            }}
          >
            Tambah Akun
          </button>
          <button
            onClick={startBot}
            disabled={engineBusy || engineRunning}
            className="rounded px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
            style={{ background: palette.accent, color: palette.bg }}
          >
            Mulai
          </button>
          <button
            onClick={stopBot}
            disabled={engineBusy || !engineRunning}
            className="rounded px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
            style={{
              background: "rgba(248,113,113,0.1)",
              border: `1px solid ${palette.red}`,
              color: palette.red,
            }}
          >
            Berhenti
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div
        className="flex flex-shrink-0 items-center gap-3 px-5 py-2"
        style={{ borderBottom: `1px solid ${palette.border}`, background: palette.bg }}
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
                className="rounded px-2 py-1 text-[13px]"
                style={{
                  background: active ? palette.accentSoft : "transparent",
                  border: `1px solid ${active ? palette.accent : palette.border}`,
                  color: active ? palette.accent : palette.textSecondary,
                }}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        <input
          type="text"
          placeholder="Cari nama atau ID akun..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="max-w-xs flex-1 rounded px-2.5 py-1.5 text-[13px]"
          style={{
            border: `1px solid ${palette.borderStrong}`,
            background: palette.card,
            color: palette.text,
          }}
        />

        <label className="flex items-center gap-1.5 text-[13px]" style={{ color: palette.textSecondary }}>
          Urutkan:
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
            className="rounded px-2 py-1 text-[13px]"
            style={{
              border: `1px solid ${palette.borderStrong}`,
              background: palette.card,
              color: palette.text,
            }}
          >
            <option value="unread">Unread terbanyak</option>
            <option value="name">Nama A–Z</option>
            <option value="post-desc">Postingan terbanyak</option>
            <option value="post-asc">Postingan terkecil</option>
            <option value="default">Urutan bawaan</option>
          </select>
        </label>

        <span className="ml-auto text-[13px]" style={{ color: palette.textMuted }}>
          {filtered.length} akun
        </span>
      </div>

      {/* Grid akun */}
      <div ref={gridRef} className="flex-1 overflow-y-auto p-5">
        {accounts.length === 0 ? (
          <div
            className="flex h-full items-center justify-center text-[13px]"
            style={{ color: palette.textMuted }}
          >
            Memuat data akun...
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex h-full items-center justify-center text-[13px]"
            style={{ color: palette.textMuted }}
          >
            Tidak ada akun ditemukan
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
              gap: GRID_GAP,
            }}
          >
            {filtered.map((account) => (
              <AccountCard
                key={account.accountId}
                account={account}
                selected={selectedId === account.accountId}
                isChecking={rotation.currentBatch.includes(account.accountId)}
                onSelect={setSelectedId}
                onRemove={removeAccount}
                onUpdate={updateAccount}
                onReply={replyNow}
                onContextMenu={(event, id) => {
                  event.preventDefault();
                  setSelectedId(id);
                  setContextMenu({ x: event.clientX, y: event.clientY, accountId: id });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        className="flex flex-shrink-0 items-center gap-4 px-5 py-2 text-[12px]"
        style={{ borderTop: `1px solid ${palette.border}`, color: palette.textMuted }}
      >
        {rotation.totalAccounts > 0 && (
          <span style={{ color: palette.textSecondary }}>
            Putaran #{rotation.round} — {rotation.checkedSoFar}/
            {rotation.totalAccounts} akun dicek
          </span>
        )}
        {rotation.currentBatch.length > 0 && (
          <span className="truncate" style={{ color: palette.accent }}>
            Sedang cek: {rotation.currentBatch.join(", ")}
          </span>
        )}
        {errorText && (
          <span className="truncate" style={{ color: palette.red }} title={errorText}>
            {errorText}
          </span>
        )}
        <span className="ml-auto">
          Panah: pilih akun · Enter: balas · Klik kanan: menu
        </span>
      </footer>

      {/* Menu klik-kanan */}
      {contextMenu && (
        <div
          className="fixed z-50 py-1"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 90),
            width: 168,
            background: palette.card,
            border: `1px solid ${palette.border}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <button
            style={menuItemStyle}
            onClick={() => {
              setContextMenu(null);
              void replyNow(contextMenu.accountId);
            }}
          >
            Balas Sekarang
          </button>
          <button
            style={{ ...menuItemStyle, color: palette.red }}
            onClick={() => {
              setContextMenu(null);
              removeAccount(contextMenu.accountId);
            }}
          >
            Hapus Akun
          </button>
        </div>
      )}

      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onCreated={replaceAccounts}
        />
      )}
    </div>
  );
}
