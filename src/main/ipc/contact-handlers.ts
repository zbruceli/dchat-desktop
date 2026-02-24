import { ipcMain, dialog } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { ContactService } from "../services/contact-service";
import type { ChatService } from "../services/chat-service";

export function registerContactHandlers(
  contactService: ContactService,
  chatService?: ChatService,
  pushToRenderer?: (channel: string, data: unknown) => void,
): void {
  ipcMain.handle(IPC.CONTACT.ADD, (_event, address: string, name?: string) => {
    return contactService.addContact({ address, name });
  });

  ipcMain.handle(IPC.CONTACT.LIST, () => {
    return contactService.listContacts();
  });

  ipcMain.handle(IPC.CONTACT.GET, (_event, address: string) => {
    return contactService.getContact(address);
  });

  ipcMain.handle(IPC.CONTACT.DELETE, (_event, address: string) => {
    contactService.deleteContact(address);
  });

  ipcMain.handle(IPC.CONTACT.UPDATE, (_event, address: string, name?: string) => {
    return contactService.updateContact({ address, name });
  });

  ipcMain.handle(IPC.CONTACT.PICK_AVATAR, async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Contact Avatar",
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC.CONTACT.SET_AVATAR, async (_event, address: string, filePath: string) => {
    return contactService.setContactAvatar(address, filePath);
  });

  ipcMain.handle(IPC.CONTACT.SET_BURN_OPTIONS, (_event, address: string, burnAfterSeconds: number) => {
    const updated = contactService.setBurnOptions(address, burnAfterSeconds);
    if (updated && chatService) {
      chatService.sendBurnOptionsToContact(address, burnAfterSeconds, updated.burnUpdateAt ?? Date.now());
      if (pushToRenderer) pushToRenderer("contact:onUpdate", updated);
    }
    return updated;
  });
}
