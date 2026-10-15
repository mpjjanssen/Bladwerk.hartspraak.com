'use strict';
/* Koppeling tussen de Mac-app en de werkruimte; geeft alleen deze functies door. */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('bladwerkLokaal', {
  gebruiker: ipcRenderer.sendSync('bladwerk:gebruiker'),
  opBestanden: (terug) => ipcRenderer.on('bladwerk:open', (_e, lijst) => terug(lijst)),
  klaar: () => ipcRenderer.send('bladwerk:klaar'),
  heicNaarJpg: (bytes) => ipcRenderer.invoke('bladwerk:heic', bytes),
  kies: (opties) => ipcRenderer.invoke('bladwerk:kies', opties),
  bewaar: (opties) => ipcRenderer.invoke('bladwerk:bewaar', opties),
  overschrijf: (opties) => ipcRenderer.invoke('bladwerk:overschrijf', opties),
  bewaarMeerdere: (opties) => ipcRenderer.invoke('bladwerk:bewaarMeerdere', opties),
  /* Waar een in de app gesleept bestand op de Mac staat. */
  pad: (bestand) => { try { return webUtils.getPathForFile(bestand) || null; } catch (_) { return null; } },
});
