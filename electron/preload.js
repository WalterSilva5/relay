// Ponte mínima main↔renderer (contextIsolation ativo).
// A UI fala com o FastAPI por fetch direto; aqui vão só utilidades do shell.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('relayShell', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
