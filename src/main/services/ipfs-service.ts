import FormData from "form-data";
import https from "https";
import http from "http";

/** nMobile-compatible IPFS gateways (tried in order) */
const DEFAULT_GATEWAYS = [
  { host: "64.225.88.71", port: 80, protocol: "http:" as const }, // nMobile self-hosted
];

export interface IpfsGateway {
  host: string;
  port: number;
  protocol: "http:" | "https:";
  authHeader?: string; // e.g. "Basic ..." for Infura
}

export interface IpfsConfig {
  gateways?: IpfsGateway[];
}

export class IpfsService {
  private gateways: IpfsGateway[] = DEFAULT_GATEWAYS;

  setConfig(config: IpfsConfig): void {
    if (config.gateways && config.gateways.length > 0) {
      this.gateways = config.gateways;
    }
  }

  getGateways(): IpfsGateway[] {
    return this.gateways;
  }

  /**
   * Upload data to IPFS via /api/v0/add (standard IPFS HTTP API).
   * Tries each gateway in order until one succeeds.
   * Returns the IPFS CID hash.
   */
  async upload(data: Buffer, fileName: string): Promise<string> {
    let lastError: Error | null = null;

    for (const gw of this.gateways) {
      try {
        const hash = await this.uploadToGateway(gw, data, fileName);
        return hash;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(
          `IPFS upload to ${gw.host}:${gw.port} failed:`,
          lastError.message,
        );
      }
    }

    throw lastError ?? new Error("No IPFS gateways configured");
  }

  /**
   * Download data from IPFS via /api/v0/cat?arg={hash} (standard IPFS HTTP API).
   * Tries each gateway in order until one succeeds.
   * Optionally prioritizes a specific IP (from message options.ipfsIp).
   */
  async download(ipfsHash: string, preferredIp?: string): Promise<Buffer> {
    // Build gateway order: preferred IP first, then the rest
    const ordered = this.orderGateways(preferredIp);
    let lastError: Error | null = null;

    for (const gw of ordered) {
      try {
        const data = await this.downloadFromGateway(gw, ipfsHash);
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(
          `IPFS download from ${gw.host}:${gw.port} failed for ${ipfsHash}:`,
          lastError.message,
        );
      }
    }

    throw lastError ?? new Error("No IPFS gateways configured");
  }

  /** Get the IP of the first gateway (used as ipfsIp in sent message options) */
  getPrimaryIp(): string {
    return this.gateways[0]?.host ?? "64.225.88.71";
  }

  /**
   * Check if an IP address is in a private/reserved range (RFC 1918, loopback, link-local).
   * Rejects addresses that could be used for SSRF against internal networks.
   */
  private isPrivateOrReservedIp(ip: string): boolean {
    // Basic IPv4 validation
    const parts = ip.split(".");
    if (parts.length !== 4) return true; // Not valid IPv4 — reject
    const octets = parts.map(Number);
    if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return true;

    const [a, b] = octets;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0
    if (a === 0) return true;

    return false;
  }

  private orderGateways(preferredIp?: string): IpfsGateway[] {
    if (!preferredIp) return this.gateways;
    const preferred = this.gateways.filter((g) => g.host === preferredIp);
    const rest = this.gateways.filter((g) => g.host !== preferredIp);
    if (preferred.length === 0) {
      // Only add ad-hoc gateways from message options if they are public IPs
      if (this.isPrivateOrReservedIp(preferredIp)) {
        console.warn(`[IpfsService] Rejected private/reserved gateway IP: ${preferredIp}`);
        return this.gateways;
      }
      return [
        { host: preferredIp, port: 80, protocol: "http:" },
        ...this.gateways,
      ];
    }
    return [...preferred, ...rest];
  }

  private uploadToGateway(
    gw: IpfsGateway,
    data: Buffer,
    fileName: string,
  ): Promise<string> {
    const form = new FormData();
    form.append("file", data, { filename: fileName });

    const headers: Record<string, string> = { ...form.getHeaders() };
    if (gw.authHeader) {
      headers["Authorization"] = gw.authHeader;
    }

    return new Promise<string>((resolve, reject) => {
      const client = gw.protocol === "https:" ? https : http;
      const req = client.request(
        {
          hostname: gw.host,
          port: gw.port,
          path: "/api/v0/add",
          method: "POST",
          headers,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => (body += chunk.toString()));
          res.on("end", () => {
            // Check ipfs-hash header first (some nodes return it there)
            const headerHash = res.headers["ipfs-hash"];
            if (headerHash) {
              resolve(Array.isArray(headerHash) ? headerHash[0] : headerHash);
              return;
            }

            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const json = JSON.parse(body);
                if (json.Hash) {
                  resolve(json.Hash as string);
                } else {
                  reject(new Error(`No Hash in IPFS response: ${body}`));
                }
              } catch {
                reject(new Error(`Failed to parse IPFS response: ${body}`));
              }
            } else {
              reject(
                new Error(`IPFS upload failed (${res.statusCode}): ${body}`),
              );
            }
          });
        },
      );

      req.on("error", reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error("IPFS upload timeout"));
      });
      form.pipe(req);
    });
  }

  private downloadFromGateway(
    gw: IpfsGateway,
    ipfsHash: string,
  ): Promise<Buffer> {
    const headers: Record<string, string> = {};
    if (gw.authHeader) {
      headers["Authorization"] = gw.authHeader;
    }

    return new Promise<Buffer>((resolve, reject) => {
      const client = gw.protocol === "https:" ? https : http;
      const req = client.request(
        {
          hostname: gw.host,
          port: gw.port,
          path: `/api/v0/cat?arg=${ipfsHash}`,
          method: "POST",
          headers,
        },
        (res) => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            // Consume body to avoid hanging
            res.resume();
            reject(
              new Error(
                `IPFS download failed (${res.statusCode}) for ${ipfsHash}`,
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        },
      );

      req.on("error", reject);
      req.setTimeout(60000, () => {
        req.destroy(new Error("IPFS download timeout"));
      });
      req.end();
    });
  }
}
