import nkn from "nkn-sdk";
import { EventEmitter } from "events";
import { NKN_SEED_RPC_SERVERS } from "../../shared/constants";
import type { ClientStatus } from "../../shared/types";

export class NknClientService extends EventEmitter {
  private client: nkn.MultiClient | null = null;
  private status: ClientStatus = { state: "disconnected" };
  private seed: string | undefined;

  getStatus(): ClientStatus {
    return { ...this.status };
  }

  async connect(seed: string): Promise<ClientStatus> {
    if (this.client) {
      await this.disconnect();
    }

    this.seed = seed;
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
      this.seed = undefined;
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
    this.seed = undefined;
    this.updateStatus({ state: "disconnected" });
  }

  getSeed(): string | undefined {
    return this.seed;
  }

  getKeyPair(): { privateKey: Uint8Array } {
    if (!this.seed) throw new Error("NKN client not connected");
    const kp = nkn.crypto.keyPair(this.seed);
    return { privateKey: kp.privateKey };
  }

  async sendMessage(dest: string, data: string): Promise<void> {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    await this.client.send(dest, data, {
      msgHoldingSeconds: 3600, // hold up to 1 hour for offline recipients
    });
  }

  /**
   * Send a message without waiting for recipient ACK.
   * Useful for IPFS image notifications where the data is already uploaded.
   */
  sendMessageNoReply(dest: string, data: string): void {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    this.client.send(dest, data, {
      noReply: true,
      msgHoldingSeconds: 3600,
    });
  }

  /**
   * Send to multiple destinations (used for topic messages).
   * Fire-and-forget — does not wait for ACK from any recipient.
   */
  sendToMultiple(dests: string[], data: string): void {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    if (dests.length === 0) return;
    this.client.send(dests, data, {
      noReply: true,
      msgHoldingSeconds: 3600,
    });
  }

  async subscribe(
    topic: string,
    duration = 400000,
    fee = "0",
  ): Promise<string> {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    const txnHash = await this.client.subscribe(topic, duration, "", "", {
      fee,
      attrs: undefined,
      buildOnly: undefined,
    } as nkn.TransactionOptions);
    return String(txnHash);
  }

  async unsubscribe(topic: string, fee = "0"): Promise<string> {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    const txnHash = await this.client.unsubscribe(topic, "", {
      fee,
      attrs: undefined,
      buildOnly: undefined,
    } as nkn.TransactionOptions);
    return String(txnHash);
  }

  async getSubscribers(topic: string): Promise<string[]> {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    const result = await this.client.getSubscribers(topic, {
      offset: 0,
      limit: 1000,
      txPool: true,
    });
    const subs = result.subscribers;
    if (Array.isArray(subs)) {
      return subs;
    }
    // Record<string, string> form — keys are addresses
    return Object.keys(subs);
  }

  async getSubscribersCount(topic: string): Promise<number> {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    return this.client.getSubscribersCount(topic);
  }

  async getSubscription(
    topic: string,
    subscriber: string,
  ): Promise<{ meta: string; expiresAt: number }> {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    return this.client.getSubscription(topic, subscriber);
  }

  async getLatestBlock(): Promise<{ height: number; hash: string }> {
    if (!this.client || this.status.state !== "connected") {
      throw new Error("NKN client not connected");
    }
    return this.client.getLatestBlock();
  }

  getPublicKey(): string {
    if (!this.client) {
      throw new Error("NKN client not connected");
    }
    return this.client.getPublicKey();
  }

  getAddress(): string | undefined {
    return this.status.address;
  }

  private updateStatus(status: ClientStatus): void {
    this.status = status;
    this.emit("statusChange", status);
  }
}
