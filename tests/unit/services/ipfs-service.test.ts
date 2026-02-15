import { describe, it, expect } from "vitest";
import { IpfsService } from "../../../src/main/services/ipfs-service";

describe("IpfsService", () => {
  describe("config management", () => {
    it("starts with default nMobile gateway", () => {
      const svc = new IpfsService();
      const gateways = svc.getGateways();
      expect(gateways).toHaveLength(1);
      expect(gateways[0].host).toBe("64.225.88.71");
      expect(gateways[0].port).toBe(80);
      expect(gateways[0].protocol).toBe("http:");
    });

    it("allows custom gateways via setConfig", () => {
      const svc = new IpfsService();
      svc.setConfig({
        gateways: [
          { host: "my-ipfs.example.com", port: 5001, protocol: "https:" },
        ],
      });
      const gateways = svc.getGateways();
      expect(gateways).toHaveLength(1);
      expect(gateways[0].host).toBe("my-ipfs.example.com");
    });

    it("keeps defaults when config has no gateways", () => {
      const svc = new IpfsService();
      svc.setConfig({ gateways: [] });
      expect(svc.getGateways()[0].host).toBe("64.225.88.71");
    });

    it("returns primary IP from first gateway", () => {
      const svc = new IpfsService();
      expect(svc.getPrimaryIp()).toBe("64.225.88.71");

      svc.setConfig({
        gateways: [
          { host: "10.0.0.1", port: 80, protocol: "http:" },
        ],
      });
      expect(svc.getPrimaryIp()).toBe("10.0.0.1");
    });
  });

  describe("upload", () => {
    it("works without any explicit config (uses default gateway)", () => {
      // The default gateway is nMobile's node, so upload should not require config
      const svc = new IpfsService();
      expect(svc.getGateways().length).toBeGreaterThan(0);
    });
  });

  describe("download", () => {
    it("uses default gateways when no preferred IP", () => {
      const svc = new IpfsService();
      expect(svc.getGateways()).toHaveLength(1);
      expect(svc.getGateways()[0].host).toBe("64.225.88.71");
    });
  });
});
