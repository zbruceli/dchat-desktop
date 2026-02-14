import nkn from "nkn-sdk";
import { EventEmitter } from "events";
import { NKN_SEED_RPC_SERVERS } from "../../shared/constants";
import type { ClientStatus } from "../../shared/types";

export class NknClientService extends EventEmitter {
  private client: nkn.MultiClient | null = null;
  private status: ClientStatus = { state: "disconnected" };

  getStatus(): ClientStatus {
    return { ...this.status };
  }

  async connect(seed: string): Promise<ClientStatus> {
    if (this.client) {
      await this.disconnect();
    }

    this.updateStatus({ state: "connecting" });

    try {
      this.client = new nkn.MultiClient({
        seed,
        numSubClients: 4,
        originalClient: false,
        rpcServerAddr: NKN_SEED_RPC_SERVERS[0],
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Connection timeout after 30s"));
        }, 30000);

        this.client!.onConnect(() => {
          clearTimeout(timeout);
          resolve();
        });
      });

      const addr = this.client.addr;
      const pubkey = this.client.getPublicKey();

      this.updateStatus({
        state: "connected",
        address: addr,
        publicKey: pubkey,
      });

      // nkn-sdk MultiClient already strips __N__. sub-client prefix from src
      this.client.onMessage(({ src, payload }: { src: string; payload: Uint8Array | string }) => {
        let data: string;
        if (payload instanceof Uint8Array) {
          data = new TextDecoder().decode(payload);
        } else {
          data = payload;
        }
        this.emit("message", src, data);
      });

      return this.getStatus();
    } catch (err) {
      this.updateStatus({ state: "disconnected" });
      this.client = null;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        this.client.close();
      } catch {
        // ignore close errors
      }
      this.client = null;
    }
    this.updateStatus({ state: "disconnected" });
  }

  async sendMessage(dest: string, data: string): Promise<void> {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    await this.client.send(dest, data);
  }

  private updateStatus(status: ClientStatus): void {
    this.status = status;
    this.emit("statusChange", status);
  }
}
