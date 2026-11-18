const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set(['pet:update', 'pet:say', 'pet:mood', 'pet:walk', 'pet:face', 'pet:dragging', 'pet:hover-reset', 'pet:pointer']);
contextBridge.exposeInMainWorld('petApi', {
  on: (ch, cb) => { if (CHANNELS.has(ch)) ipcRenderer.on(ch, (_e, ...a) => cb(...a)); },
  hover: (over) => ipcRenderer.send('pet:hover', !!over),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  context: () => ipcRenderer.send('pet:context'),
  bubbleClick: (open) => ipcRenderer.send('pet:bubble-click', !!open),
});
