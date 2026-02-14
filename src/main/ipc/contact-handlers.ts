import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { ContactService } from "../services/contact-service";

export function registerContactHandlers(contactService: ContactService): void {
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
}
