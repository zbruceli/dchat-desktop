import { app, BrowserWindow, ipcMain, protocol, net } from "electron";
import path from "path";
import { pathToFileURL } from "url";
import { initDatabase, closeDatabase } from "./db/database";
import { MessageRepository } from "./db/repositories/message-repository";
import { ContactRepository } from "./db/repositories/contact-repository";
import { SessionRepository } from "./db/repositories/session-repository";
import { NknClientService } from "./services/nkn-client-service";
import { ChatService } from "./services/chat-service";
import { ContactService } from "./services/contact-service";
import { SessionService } from "./services/session-service";
import { IpfsService } from "./services/ipfs-service";
import { ImageService } from "./services/image-service";
import { AudioService } from "./services/audio-service";
import { FileService } from "./services/file-service";
import { TopicService } from "./services/topic-service";
import { TopicRepository } from "./db/repositories/topic-repository";
import { TopicSubscriberRepository } from "./db/repositories/topic-subscriber-repository";
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

// Register custom protocol for serving cached images
protocol.registerSchemesAsPrivileged([
  {
    scheme: "dchat-media",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

app.whenReady().then(() => {
  // 1. Initialize database
  const userDataPath = app.getPath("userData");
  const db = initDatabase(userDataPath);

  // 2. Create repositories
  const messageRepo = new MessageRepository(db);
  const contactRepo = new ContactRepository(db);
  const sessionRepo = new SessionRepository(db);
  const topicRepo = new TopicRepository(db);
  const subscriberRepo = new TopicSubscriberRepository(db);

  // 3. Create IPFS + Image services
  const ipfsService = new IpfsService();
  const imageService = new ImageService(ipfsService, userDataPath);

  // Load IPFS config from settings (if user customized gateways)
  const settingsRow = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("ipfs_config") as { value: string } | undefined;
  if (settingsRow?.value) {
    try {
      const config = JSON.parse(settingsRow.value);
      if (config.gateways) {
        ipfsService.setConfig(config);
      }
    } catch {
      // ignore invalid config — defaults to nMobile gateway
    }
  }

  // MIME type map for media files served via dchat-media://
  const MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".aac": "audio/aac",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
  };

  // Register dchat-media:// protocol handler
  protocol.handle("dchat-media", async (request) => {
    const url = new URL(request.url);
    // dchat-media://image-cache/filename → {userData}/image-cache/filename
    // dchat-media://audio-cache/filename → {userData}/audio-cache/filename
    const filePath = path.join(userDataPath, url.hostname, url.pathname);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext];

    if (mimeType) {
      // Read file and return with explicit Content-Type for reliable playback
      const fs = await import("fs");
      try {
        const data = fs.readFileSync(filePath);
        return new Response(data, {
          headers: { "Content-Type": mimeType },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    // Fallback for unknown types
    return net.fetch(pathToFileURL(filePath).href);
  });

  // 4. Create window
  createWindow();

  // 5. Create NKN client service with push callbacks
  const nknClient = new NknClientService();
  nknClient.on("statusChange", (status) => {
    pushToRenderer(IPC.CLIENT.ON_STATUS_CHANGE, status);
  });

  // 6. Create services
  const chatService = new ChatService(
    nknClient,
    messageRepo,
    sessionRepo,
    contactRepo,
    pushToRenderer,
  );
  const audioService = new AudioService(ipfsService, userDataPath);
  const fileService = new FileService(ipfsService, userDataPath);
  chatService.setImageService(imageService);
  chatService.setAudioService(audioService);
  chatService.setFileService(fileService);

  const topicService = new TopicService(
    nknClient,
    topicRepo,
    subscriberRepo,
    messageRepo,
    sessionRepo,
    contactRepo,
    pushToRenderer,
  );
  topicService.setImageService(imageService);
  chatService.setTopicService(topicService);

  const contactService = new ContactService(contactRepo);
  const sessionService = new SessionService(sessionRepo);

  // 7. Register IPC handlers
  registerAllHandlers({ nknClient, chatService, contactService, sessionService, ipfsService, topicService });

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
