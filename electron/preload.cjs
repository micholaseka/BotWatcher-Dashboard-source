// electron/preload.cjs
//
// Jembatan aman antara Electron dan React.
// React tidak mengakses Node.js/filesystem langsung.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getAccounts: () => ipcRenderer.invoke("accounts:getAll"),

  onAccountsUpdate: (callback) => {
    const listener = (_event, statuses) => callback(statuses);
    ipcRenderer.on("accounts:update", listener);
    return () => ipcRenderer.removeListener("accounts:update", listener);
  },

  getEngineStatus: () => ipcRenderer.invoke("engine:getStatus"),
  startEngine: () => ipcRenderer.invoke("engine:start"),
  stopEngine: () => ipcRenderer.invoke("engine:stop"),

  onEngineStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("engine:status", listener);
    return () => ipcRenderer.removeListener("engine:status", listener);
  },

  onEngineLog: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on("engine:log", listener);
    return () => ipcRenderer.removeListener("engine:log", listener);
  },

  removeAccount: (accountId) =>
    ipcRenderer.invoke("accounts:remove", accountId),
  updateAccount: (accountId, updates) =>
    ipcRenderer.invoke("accounts:update", { accountId, updates }),
  openReplySession: (accountId) =>
    ipcRenderer.invoke("accounts:openReply", accountId),

  getRotationState: () => ipcRenderer.invoke("rotation:getState"),
  onRotationUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("rotation:update", listener);
    return () => ipcRenderer.removeListener("rotation:update", listener);
  },
});
