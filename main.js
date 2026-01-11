const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const tasksFilePath = path.join(app.getPath('userData'), 'tasks.json');

// Asegurar que el directorio de datos existe al iniciar
app.whenReady().then(() => {
  const dir = path.dirname(tasksFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Gestor de Tareas',
    autoHideMenuBar: true
  });

  // Ocultar completamente la barra de menú
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile('index.html');

  // Abrir DevTools en modo desarrollo
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Función para leer las tareas desde el archivo JSON
function loadTasksFromFile() {
  try {
    if (fs.existsSync(tasksFilePath)) {
      const data = fs.readFileSync(tasksFilePath, 'utf8');
      const parsed = JSON.parse(data);
      // Si es un array (formato antiguo), convertirlo al nuevo formato
      if (Array.isArray(parsed)) {
        return {
          tasks: parsed,
          deletedTasks: []
        };
      }
      // Si ya es un objeto con tasks y deletedTasks, retornarlo
      return parsed;
    }
    return { tasks: [], deletedTasks: [] };
  } catch (error) {
    console.error('Error al leer el archivo de tareas:', error);
    return { tasks: [], deletedTasks: [] };
  }
}

// Función para guardar las tareas en el archivo JSON
function saveTasksToFile(data) {
  try {
    // Asegurar que el directorio existe
    const dir = path.dirname(tasksFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Si es un array (formato antiguo), convertirlo al nuevo formato
    const toSave = Array.isArray(data) 
      ? { tasks: data, deletedTasks: [] }
      : data;
    fs.writeFileSync(tasksFilePath, JSON.stringify(toSave, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error al guardar el archivo de tareas:', error);
    return false;
  }
}

// Handlers IPC para comunicación con el proceso de renderizado
ipcMain.handle('load-tasks', () => {
  return loadTasksFromFile();
});

ipcMain.handle('save-tasks', (event, tasks) => {
  return saveTasksToFile(tasks);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
