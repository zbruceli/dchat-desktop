export interface Contact {
  address: string;
  name: string;
  avatarUri?: string;
  profileVersion?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AddContactParams {
  address: string;
  name?: string;
}

export interface UpdateContactParams {
  address: string;
  name?: string;
  avatarUri?: string;
  profileVersion?: string;
}
