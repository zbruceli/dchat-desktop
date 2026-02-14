import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { initDatabase, closeDatabase } from "./db/database";
import { MessageRepository } from "./db/repositories/message-repository";
import { ContactRepository } from "./db/repositories/contact-repository";
import { SessionRepository } from "./db/repositories/session-repository";
import { NknClientService } from "./services/nkn-client-service";
import { ChatService } from "./services/chat-service";
import { ContactService } from "./services/contact-service";
import { SessionService } from "./services/session-service";
import { registerAllHandlers } from "./ipc/register-all";
import { IPC } from "../shared/ipc-channels";

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "D-Chat Desktop",
    webPreferences: {
      preload: path.join(__dirname, "../../preload/preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function pushToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

app.whenReady().then(() => {
  // 1. Initialize database
  const db = initDatabase(app.getPath("userData"));

  // 2. Create repositories
  const messageRepo = new MessageRepository(db);
  const contactRepo = new ContactRepository(db);
  const sessionRepo = new SessionRepository(db);

  // 3. Create window
  createWindow();

  // 4. Create NKN client service with push callbacks
  const nknClient = new NknClientService();
  nknClient.on("statusChange", (status) => {
    pushToRenderer(IPC.CLIENT.ON_STATUS_CHANGE, status);
  });

  // 5. Create services
  const chatService = new ChatService(
    nknClient,
    messageRepo,
    sessionRepo,
    contactRepo,
    pushToRenderer,
  );
  const contactService = new ContactService(contactRepo);
  const sessionService = new SessionService(sessionRepo);

  // 6. Register IPC handlers
  registerAllHandlers({ nknClient, chatService, contactService, sessionService });

  // App info handler
  ipcMain.handle(IPC.APP.GET_INFO, () => ({
    name: app.getName(),
    version: app.getVersion(),
  }));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  closeDatabase();
});
