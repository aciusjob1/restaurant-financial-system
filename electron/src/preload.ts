import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  version: () => ipcRenderer.invoke('app:version') as Promise<string>,
});