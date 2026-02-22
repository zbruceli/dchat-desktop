export interface WalletInfo {
  address: string;
  publicKey: string;
  keystore: string;
  // seed intentionally omitted — never sent to renderer
}

export interface CreateWalletParams {
  password: string;
}

export interface ImportWalletParams {
  keystore: string;
  password: string;
}
