import { app, BrowserWindow, ipcMain, protocol, net, shell } from "electron";
import crypto from "crypto";
import path from "path";
import { pathToFileURL } from "url";
import { initDatabase, closeDatabase } from "./db/database";
import { migrateToEncrypted } from "./db/migrate-to-encrypted";
import { MessageRepository } from "./db/repositories/message-repository";
import { ContactRepository } from "./db/repositories/contact-repository";
import { SessionRepository } from "./db/repositories/session-repository";
import { NknClientService } from "./services/nkn-client-service";
import { WalletStorageService } from "./services/wallet-storage-service";
import { ChatService } from "./services/chat-service";
import { ContactService } from "./services/contact-service";
import { SessionService } from "./services/session-service";
import { IpfsService } from "./services/ipfs-service";
import { ImageService } from "./services/image-service";
import { AudioService } from "./services/audio-service";
import { FileService } from "./services/file-service";
import { TopicService } from "./services/topic-service";
import { PrivateGroupService } from "./services/private-group-service";
import { ProfileService } from "./services/profile-service";
import { ContactProfileService } from "./services/contact-profile-service";
import { TopicRepository } from "./db/repositories/topic-repository";
import { TopicSubscriberRepository } from "./db/repositories/topic-subscriber-repository";
import { PrivateGroupRepository } from "./db/repositories/private-group-repository";
import { PrivateGroupMemberRepository } from "./db/repositories/private-group-member-repository";
import { DiscoveredGroupRepository } from "./db/repositories/discovered-group-repository";
import { DiscoveryService } from "./services/discovery-service";
import {
  registerPreDbHandlers,
  registerPostDbHandlers,
} from "./ipc/register-all";
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

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

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
  const userDataPath = app.getPath("userData");

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
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
  };

  // Register dchat-media:// protocol handler
  protocol.handle("dchat-media", async (request) => {
    const url = new URL(request.url);
    const filePath = path.join(userDataPath, url.hostname, url.pathname);

    // Prevent path traversal — resolved path must stay within userDataPath
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(userDataPath);
    if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext];

    if (mimeType) {
      const fs = await import("fs");
      try {
        const data = fs.readFileSync(resolvedPath);
        return new Response(data, {
          headers: { "Content-Type": mimeType },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    return net.fetch(pathToFileURL(resolvedPath).href);
  });

  // 1. Create window
  createWindow();

  // 2. Create NKN client service + wallet storage (no DB needed)
  const nknClient = new NknClientService();
  nknClient.on("statusChange", (status) => {
    pushToRenderer(IPC.CLIENT.ON_STATUS_CHANGE, status);
  });

  const walletStorage = new WalletStorageService(userDataPath);

  // Track whether services have been initialized
  let servicesInitialized = false;

  // 3. Define initServices callback (called after wallet is loaded)
  function initServices(seed: string): void {
    if (servicesInitialized) return;

    const dbKey = crypto.createHash("sha256").update(seed, "hex").digest("hex");

    // Migrate existing unencrypted DB if needed
    migrateToEncrypted(userDataPath, dbKey);

    // Initialize encrypted database
    const db = initDatabase(userDataPath, dbKey);

    // Create repositories
    const messageRepo = new MessageRepository(db);
    const contactRepo = new ContactRepository(db);
    const sessionRepo = new SessionRepository(db);
    const topicRepo = new TopicRepository(db);
    const subscriberRepo = new TopicSubscriberRepository(db);
    const privateGroupRepo = new PrivateGroupRepository(db);
    const privateGroupMemberRepo = new PrivateGroupMemberRepository(db);
    const discoveredGroupRepo = new DiscoveredGroupRepository(db);

    // Create IPFS + media services
    const ipfsService = new IpfsService();
    const imageService = new ImageService(ipfsService, userDataPath);

    // Load IPFS config from settings
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
        // ignore invalid config
      }
    }

    // Create services
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
    topicService.setAudioService(audioService);
    topicService.setFileService(fileService);
    chatService.setTopicService(topicService);

    const privateGroupService = new PrivateGroupService(
      nknClient,
      privateGroupRepo,
      privateGroupMemberRepo,
      messageRepo,
      sessionRepo,
      contactRepo,
      pushToRenderer,
    );
    privateGroupService.setImageService(imageService);
    privateGroupService.setAudioService(audioService);
    privateGroupService.setFileService(fileService);
    chatService.setPrivateGroupService(privateGroupService);

    const contactService = new ContactService(contactRepo, userDataPath);
    const sessionService = new SessionService(sessionRepo);
    const profileService = new ProfileService(db, userDataPath, pushToRenderer);

    const contactProfileService = new ContactProfileService(
      nknClient,
      profileService,
      contactRepo,
      sessionRepo,
      pushToRenderer,
      userDataPath,
    );
    chatService.setContactProfileService(contactProfileService);

    // Discovery service
    const discoveryService = new DiscoveryService(
      nknClient,
      topicRepo,
      subscriberRepo,
      discoveredGroupRepo,
      pushToRenderer,
    );
    chatService.setDiscoveryService(discoveryService);

    // Wire up desktop notifications
    if (mainWindow) {
      chatService.setMainWindow(mainWindow);
    }
    const notifCallback = (title: string, body: string, sessionId: string) =>
      chatService.showNotification(title, body, sessionId);
    topicService.setNotificationCallback(notifCallback);
    privateGroupService.setNotificationCallback(notifCallback);

    // Register post-DB IPC handlers
    registerPostDbHandlers({
      chatService,
      contactService,
      sessionService,
      ipfsService,
      topicService,
      profileService,
      privateGroupService,
      discoveryService,
      topicRepo,
      walletStorage,
      userDataPath,
    }, pushToRenderer);

    // Start discovery service (after IPC handlers are registered)
    discoveryService.start().catch((err) =>
      console.error("[Main] Failed to start discovery service:", err),
    );

    servicesInitialized = true;
  }

  // 4. Register pre-DB IPC handlers (wallet, client, app)
  registerPreDbHandlers(nknClient, walletStorage, initServices);

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
