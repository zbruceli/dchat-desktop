import type { ContactRepository } from "../db/repositories/contact-repository";
import type { Contact, AddContactParams } from "../../shared/types";

export class ContactService {
  constructor(private contactRepo: ContactRepository) {}

  addContact(params: AddContactParams): Contact {
    const now = Date.now();
    const contact: Contact = {
      address: params.address,
      name: params.name ?? params.address.substring(0, 8) + "...",
      createdAt: now,
      updatedAt: now,
    };
    this.contactRepo.upsert(contact);
    return contact;
  }

  getContact(address: string): Contact | undefined {
    return this.contactRepo.findByAddress(address);
  }

  listContacts(): Contact[] {
    return this.contactRepo.findAll();
  }

  deleteContact(address: string): void {
    this.contactRepo.deleteByAddress(address);
  }
}
