const { app, BrowserWindow, Notification, ipcMain, screen } = require('electron');
const path = require('path');

const NORMAL_SIZE = { width: 460, height: 640 };
const DOCKED_SIZE = { width: 240, height: 140 };
const DOCK_MARGIN = 16;

if (process.platform === 'win32') {
  app.setAppUserModelId('com.yuchen.helper3030');
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: NORMAL_SIZE.width,
    height: NORMAL_SIZE.height,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#FFFFFF',
    title: '30-30',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
}

ipcMain.handle('win-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('win-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('win-dock', () => {
  if (!mainWindow) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const x = wa.x + wa.width - DOCKED_SIZE.width - DOCK_MARGIN;
  const y = wa.y + wa.height - DOCKED_SIZE.height - DOCK_MARGIN;
  mainWindow.setBounds({ x, y, ...DOCKED_SIZE }, false);
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
});

ipcMain.handle('win-undock', () => {
  if (!mainWindow) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const x = Math.round(wa.x + (wa.width - NORMAL_SIZE.width) / 2);
  const y = Math.round(wa.y + (wa.height - NORMAL_SIZE.height) / 2);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setBounds({ x, y, ...NORMAL_SIZE }, false);
});

ipcMain.handle('show-notification', (_event, { title, body }) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({
    title,
    body,
    silent: false,
    urgency: 'normal'
  });
  n.show();
  return true;
});

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
