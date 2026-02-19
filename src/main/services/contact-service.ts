import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import type { ContactRepository } from "../db/repositories/contact-repository";
import type { Contact, AddContactParams, UpdateContactParams } from "../../shared/types";

const AVATAR_SIZE = 200;
const AVATAR_QUALITY = 80;

export class ContactService {
  private cacheDir: string;

  constructor(
    private contactRepo: ContactRepository,
    userDataPath: string,
  ) {
    this.cacheDir = path.join(userDataPath, "contact-cache");
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

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

  updateContact(params: UpdateContactParams): Contact | undefined {
    const existing = this.contactRepo.findByAddress(params.address);
    if (!existing) return undefined;

    const updated: Contact = {
      ...existing,
      name: params.name ?? existing.name,
      avatarUri: params.avatarUri ?? existing.avatarUri,
      updatedAt: Date.now(),
    };
    this.contactRepo.upsert(updated);
    return updated;
  }

  async setContactAvatar(address: string, filePath: string): Promise<Contact | undefined> {
    const existing = this.contactRepo.findByAddress(address);
    if (!existing) return undefined;

    const imageBuffer = fs.readFileSync(filePath);
    const resized = await sharp(imageBuffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .jpeg({ quality: AVATAR_QUALITY })
      .toBuffer();

    const hash = crypto.createHash("sha256").update(address).digest("hex").slice(0, 16);
    const avatarFile = `${hash}.jpg`;
    fs.writeFileSync(path.join(this.cacheDir, avatarFile), resized);

    return this.updateContact({ address, avatarUri: avatarFile });
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
