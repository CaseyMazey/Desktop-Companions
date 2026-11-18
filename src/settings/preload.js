const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pets', {
  get: () => ipcRenderer.invoke('settings:get'),
  preset: (kind) => ipcRenderer.invoke('settings:preset', kind),
  savePet: (p) => ipcRenderer.invoke('settings:save-pet', p),
  addPet: (kind) => ipcRenderer.invoke('settings:add-pet', kind),
  removePet: (id) => ipcRenderer.invoke('settings:remove-pet', id),
  testPet: (id) => ipcRenderer.invoke('settings:test-pet', id),
  openApp: (id) => ipcRenderer.invoke('settings:open-app', id),
  chatNow: () => ipcRenderer.invoke('settings:chat-now'),
  saveGlobal: (g) => ipcRenderer.invoke('settings:save-global', g),
  pickFile: () => ipcRenderer.invoke('settings:pick-file'),
  onState: (cb) => ipcRenderer.on('settings:state', (_e, s) => cb(s)),
  onFocus: (cb) => ipcRenderer.on('settings:focus', (_e, id) => cb(id)),
});
