const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 600,
    minWidth: 900,
    minHeight: 540,
    show: false,
    backgroundColor: '#1a1a2e',
    title: 'Piano MIDI Visualizer',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Grant MIDI permissions silently — both handlers required for Chrome 124+
  win.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'midi' || permission === 'midiSysex') return true;
    return false;
  });

  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      callback(true);
    } else {
      callback(false);
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.maximize();
  win.show();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
