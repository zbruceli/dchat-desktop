export interface Contact {
  address: string;
  name: string;
  avatarUri?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AddContactParams {
  address: string;
  name?: string;
}
