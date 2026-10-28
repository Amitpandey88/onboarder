const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('onboarderDesktop', {
  initial: () => ipcRenderer.invoke('desktop:initial'),
  home: () => ipcRenderer.invoke('desktop:home'),
  preferences: patch => ipcRenderer.invoke('desktop:preferences', patch),
  cancelClone: () => ipcRenderer.invoke('desktop:cancel-clone'),
  openProject: path => ipcRenderer.invoke('desktop:open', path),
  openDemo: () => ipcRenderer.invoke('desktop:demo'),
  cloneProject: (url, options) => ipcRenderer.invoke('desktop:clone', url, options),
  clearRecents: () => ipcRenderer.invoke('desktop:clear-recents'),
  reveal: () => ipcRenderer.invoke('desktop:reveal'),
  credential: (action, endpoint, secret) => ipcRenderer.invoke('desktop:credential', action, endpoint, secret),
  terminal: (action, input) => ipcRenderer.invoke('desktop:terminal', action, input),
  dropped: files => ipcRenderer.invoke('desktop:drop', files.slice(0, 8).map(file => webUtils.getPathForFile(file))),
  subscribe: listener => {
    const handler = (_event, data) => listener(data);
    ipcRenderer.on('desktop:event', handler);
    return () => ipcRenderer.removeListener('desktop:event', handler);
  },
});
