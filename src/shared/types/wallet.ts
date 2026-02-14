export interface WalletInfo {
  address: string;
  publicKey: string;
  seed: string;
  keystore: string;
}

export interface CreateWalletParams {
  password: string;
}

export interface ImportWalletParams {
  keystore: string;
  password: string;
}
