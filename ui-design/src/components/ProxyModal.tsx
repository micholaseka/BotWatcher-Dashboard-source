import { useState } from "react";

type ProxyModalProps = {
  account: AccountStatusData;
  onClose: () => void;
  onSaved: (account: AccountStatusData) => void;
};

export default function ProxyModal({
  account,
  onClose,
  onSaved,
}: ProxyModalProps) {
  const [server, setServer] = useState(account.proxyServer ?? "");

  const [username, setUsername] = useState(account.proxyUsername ?? "");

  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");

    if (!server.trim()) {
      setError("Proxy server wajib diisi.");
      return;
    }

    setBusy(true);

    try {
      const updated = await window.api.setAccountProxy(account.accountId, {
        server: server.trim(),
        username: username.trim(),
        password,
      });

      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);

    try {
      const updated = await window.api.removeAccountProxy(account.accountId);

      onSaved(updated);
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
      style={{
        background: "rgba(0,0,0,0.65)",
      }}
    >
      <div
        className="w-full max-w-md rounded-xl p-5"
        style={{
          background: "#141820",
          border: "1px solid #2a3050",
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
              Proxy — {account.name}
            </div>

            <div
              className="text-[10px] mt-1"
              style={{
                color: "#64748b",
                fontFamily: "var(--font-mono)",
              }}
            >
              Contoh: http://127.0.0.1:8080
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={busy}
            className="text-lg"
            style={{ color: "#64748b" }}
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder="http://host:port"
            className="w-full px-3 py-2 rounded text-xs outline-none"
            style={{
              background: "#10141c",
              border: "1px solid #1e2436",
              color: "#e2e8f0",
            }}
          />

          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full px-3 py-2 rounded text-xs outline-none"
            style={{
              background: "#10141c",
              border: "1px solid #1e2436",
              color: "#e2e8f0",
            }}
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={account.proxyConfigured ? "Password baru" : "Password"}
            className="w-full px-3 py-2 rounded text-xs outline-none"
            style={{
              background: "#10141c",
              border: "1px solid #1e2436",
              color: "#e2e8f0",
            }}
          />

          {error && (
            <div
              className="text-[10px] p-2 rounded"
              style={{
                color: "#f87171",
                background: "rgba(239,68,68,0.08)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-between mt-5">
          <button
            onClick={remove}
            disabled={busy || !account.proxyConfigured}
            className="px-3 py-2 rounded text-[10px]"
            style={{
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            Hapus Proxy
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-3 py-2 rounded text-[10px]"
              style={{
                color: "#64748b",
                border: "1px solid #1e2436",
              }}
            >
              Batal
            </button>

            <button
              onClick={save}
              disabled={busy}
              className="px-3 py-2 rounded text-[10px]"
              style={{
                color: "#60a5fa",
                border: "1px solid #3b82f640",
                background: "#3b82f618",
              }}
            >
              {busy ? "Menyimpan..." : "Simpan Proxy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
