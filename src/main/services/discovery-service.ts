import fs from "fs";
import path from "path";
import { app } from "electron";
import sharp from "sharp";
import type { NknClientService } from "./nkn-client-service";
import type { TopicService } from "./topic-service";
import type { TopicRepository } from "../db/repositories/topic-repository";
import type { TopicSubscriberRepository } from "../db/repositories/topic-subscriber-repository";
import type { DiscoveredGroupRepository } from "../db/repositories/discovered-group-repository";
import type { DiscoveredGroup, DiscoveryBroadcastMessage, AnnouncementMessage, AnnouncementGroup } from "../../shared/types";
import { genTopicHash } from "../utils/topic-hash";

const DISCOVERY_TOPIC_NAME = "publicGroups";
const BROADCAST_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const VERIFY_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_BROADCAST_GROUPS = 50;
const INITIAL_DELAY_MS = 15_000; // 15 seconds after start

const SEED_GROUPS: { name: string; description: string; category: string }[] = [
  { name: "d-chat", description: "D-Chat community group", category: "Community" },
  { name: "nkn", description: "NKN general discussion", category: "Community" },
  { name: "general", description: "General chat", category: "General" },
  { name: "nMobile", description: "nMobile app discussion", category: "Community" },
  { name: "nkn-chat", description: "NKN chat community", category: "Community" },
  { name: "中文", description: "Chinese language group", category: "General" },
];

export class DiscoveryService {
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private verifyTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private discoveryTopicHash: string;
  private discoveryCacheDir: string;
  private topicService: TopicService | null = null;

  constructor(
    private nknClient: NknClientService,
    private topicRepo: TopicRepository,
    private subscriberRepo: TopicSubscriberRepository,
    private discoveredGroupRepo: DiscoveredGroupRepository,
    private pushToRenderer: (channel: string, data: unknown) => void,
  ) {
    this.discoveryTopicHash = genTopicHash(DISCOVERY_TOPIC_NAME);
    this.discoveryCacheDir = path.join(app.getPath("userData"), "discovery-cache");
    if (!fs.existsSync(this.discoveryCacheDir)) {
      fs.mkdirSync(this.discoveryCacheDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    // Seed bootstrap groups immediately (DB-only, no network needed)
    this.seedBootstrapGroups();

    // Wait for NKN client to connect before subscribing and broadcasting
    const status = this.nknClient.getStatus();
    if (status.state === "connected") {
      this.startNetworkTasks();
    } else {
      // Listen for connection then start
      const onStatusChange = (s: { state: string }) => {
        if (s.state === "connected") {
          this.nknClient.removeListener("statusChange", onStatusChange);
          this.startNetworkTasks();
        }
      };
      this.nknClient.on("statusChange", onStatusChange);
    }
  }

  private startNetworkTasks(): void {
    // Subscribe to discovery topic (blockchain txn, best-effort)
    this.nknClient.subscribe(this.discoveryTopicHash).then(() => {
      console.log(`[DiscoveryService] Subscribed to discovery topic "${DISCOVERY_TOPIC_NAME}"`);
    }).catch((err) => {
      console.error("[DiscoveryService] Failed to subscribe to discovery topic:", err);
    });

    // Initial broadcast and verify after a short delay
    this.initialTimer = setTimeout(async () => {
      try {
        await this.broadcastKnownGroups();
        await this.verifySubscriberCounts();
      } catch (err) {
        console.error("[DiscoveryService] Initial tasks error:", err);
      }
    }, INITIAL_DELAY_MS);

    // Start periodic timers
    this.broadcastTimer = setInterval(() => {
      this.broadcastKnownGroups().catch((err) =>
        console.error("[DiscoveryService] Broadcast error:", err),
      );
    }, BROADCAST_INTERVAL_MS);

    this.verifyTimer = setInterval(() => {
      this.verifySubscriberCounts().catch((err) =>
        console.error("[DiscoveryService] Verify error:", err),
      );
    }, VERIFY_INTERVAL_MS);

    this.cleanupTimer = setInterval(() => {
      this.cleanupStale();
    }, CLEANUP_INTERVAL_MS);
  }

  stop(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    if (this.verifyTimer) {
      clearInterval(this.verifyTimer);
      this.verifyTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
  }

  private seedBootstrapGroups(): void {
    const now = Date.now();
    for (const seed of SEED_GROUPS) {
      const existing = this.discoveredGroupRepo.findByTopicName(seed.name);
      if (!existing) {
        this.discoveredGroupRepo.upsert({
          topicName: seed.name,
          description: seed.description,
          category: seed.category,
          subscriberCount: 0,
          reportedBy: "bootstrap",
          lastReportedAt: now,
        });
      }
    }
  }

  async broadcastKnownGroups(): Promise<void> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) return;

    // Gather joined topics + discovered groups
    const joinedTopics = this.topicRepo.findJoined();
    const discoveredGroups = this.discoveredGroupRepo.findAll();

    // Build unique group list, prioritize joined topics
    const groupMap = new Map<string, AnnouncementGroup>();

    for (const topic of joinedTopics) {
      groupMap.set(topic.id, {
        topicId: topic.id,
        name: topic.id,
        subscriberCount: topic.memberCount,
      });
    }

    for (const group of discoveredGroups) {
      if (!groupMap.has(group.topicName)) {
        const announcementGroup: AnnouncementGroup = {
          topicId: group.topicName,
          name: group.topicName,
          description: group.description,
          category: group.category,
          subscriberCount: group.subscriberCount,
        };

        // Include cached avatar if available
        if (group.avatarUri) {
          const avatarData = this.readCachedAvatar(group.avatarUri);
          if (avatarData) {
            announcementGroup.avatar = avatarData;
          }
        }

        groupMap.set(group.topicName, announcementGroup);
      }
    }

    const groups = Array.from(groupMap.values()).slice(0, MAX_BROADCAST_GROUPS);
    if (groups.length === 0) return;

    const announcementMsg: AnnouncementMessage = {
      type: "announcement",
      version: "1.0",
      timestamp: new Date().toISOString(),
      sender: myAddress,
      payload: { groups },
    };

    // Base64-encode the JSON (nMobile 2026 format)
    const base64Payload = Buffer.from(JSON.stringify(announcementMsg)).toString("base64");

    // Send to all subscribers on the discovery topic
    try {
      const subscribers = await this.nknClient.getSubscribers(this.discoveryTopicHash);
      const dests = subscribers.filter((addr) => addr !== myAddress);
      if (dests.length > 0) {
        this.nknClient.sendToMultiple(dests, base64Payload);
        console.log(`[DiscoveryService] Broadcast ${groups.length} groups to ${dests.length} peers (nMobile 2026 format)`);
      }
    } catch (err) {
      console.error("[DiscoveryService] Failed to broadcast:", err);
    }
  }

  /** Handle nMobile 2026 announcement messages (base64-decoded by chat-service) */
  handleAnnouncementMessage(src: string, msg: AnnouncementMessage): void {
    if (!msg.payload?.groups || !Array.isArray(msg.payload.groups)) return;

    const now = Date.now();
    let updated = false;

    for (const g of msg.payload.groups) {
      if (!g.topicId || typeof g.topicId !== "string") continue;
      if (g.topicId.length > 64) continue;

      // Cache avatar if present
      let avatarUri: string | undefined;
      if (g.avatar?.data && g.avatar?.ext) {
        avatarUri = this.cacheAvatar(g.topicId, g.avatar.data, g.avatar.ext);
      }

      this.discoveredGroupRepo.upsert({
        topicName: g.topicId,
        description: g.description ?? g.name,
        category: g.category,
        subscriberCount: g.subscriberCount ?? 0,
        reportedBy: src,
        lastReportedAt: now,
        avatarUri,
      });
      updated = true;
    }

    if (updated) {
      console.log(`[DiscoveryService] Received announcement from ${src.substring(0, 16)}... with ${msg.payload.groups.length} groups`);
      this.pushDiscoveryUpdate();
    }
  }

  /** Handle old D-Chat compact broadcast format (backward compat) */
  handleIncomingBroadcast(src: string, data: DiscoveryBroadcastMessage): void {
    if (!data.groups || !Array.isArray(data.groups)) return;

    const now = Date.now();
    let updated = false;

    for (const g of data.groups) {
      if (!g.n || typeof g.n !== "string") continue;
      // Basic validation
      if (g.n.length > 64) continue;

      this.discoveredGroupRepo.upsert({
        topicName: g.n,
        description: g.d,
        category: g.c,
        subscriberCount: g.s ?? 0,
        reportedBy: src,
        lastReportedAt: now,
      });
      updated = true;
    }

    if (updated) {
      this.pushDiscoveryUpdate();
    }
  }

  async verifySubscriberCounts(): Promise<void> {
    const groups = this.discoveredGroupRepo.findAll();
    let updated = false;

    for (const group of groups) {
      try {
        const topicHash = genTopicHash(group.topicName);
        const count = await this.nknClient.getSubscribersCount(topicHash);
        if (count !== group.subscriberCount) {
          this.discoveredGroupRepo.updateSubscriberCount(group.topicName, count);
          updated = true;
        }
      } catch (err) {
        // Skip individual failures
        console.error(
          `[DiscoveryService] Failed to verify count for "${group.topicName}":`,
          err,
        );
      }
    }

    if (updated) {
      this.pushDiscoveryUpdate();
    }
  }

  cleanupStale(): void {
    const removed = this.discoveredGroupRepo.deleteStale(STALE_THRESHOLD_MS);
    if (removed > 0) {
      console.log(`[DiscoveryService] Cleaned up ${removed} stale groups`);
      this.pushDiscoveryUpdate();
    }
  }

  getDiscoveredGroups(joinedTopicNames: string[]): DiscoveredGroup[] {
    const groups = this.discoveredGroupRepo.findAll();
    const joinedSet = new Set(joinedTopicNames);
    return groups.map((g) => ({
      ...g,
      joined: joinedSet.has(g.topicName),
    }));
  }

  getCategories(): string[] {
    return this.discoveredGroupRepo.getCategories();
  }

  async refresh(): Promise<void> {
    await this.broadcastKnownGroups();
    await this.verifySubscriberCounts();
  }

  setTopicService(topicService: TopicService): void {
    this.topicService = topicService;
  }

  async createAndBroadcastGroup(params: {
    name: string;
    description?: string;
    category?: string;
    avatarPath?: string;
  }): Promise<void> {
    if (!this.topicService) throw new Error("TopicService not set");

    // Create and join the topic (blockchain subscribe + DB insert)
    await this.topicService.createAndJoin(params.name);

    // Process avatar if provided
    let avatarUri: string | undefined;
    if (params.avatarPath) {
      try {
        const safeName = params.name.replace(/[/\\:*?"<>|]/g, "_");
        const filename = `${safeName}.jpeg`;
        const outputPath = path.join(this.discoveryCacheDir, filename);
        await sharp(params.avatarPath)
          .resize(200, 200, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toFile(outputPath);
        avatarUri = filename;
      } catch (err) {
        console.error("[DiscoveryService] Failed to process avatar:", err);
      }
    }

    // Upsert into discovered_group
    const myAddress = this.nknClient.getAddress() ?? "self";
    this.discoveredGroupRepo.upsert({
      topicName: params.name,
      description: params.description,
      category: params.category,
      subscriberCount: 1,
      reportedBy: myAddress,
      lastReportedAt: Date.now(),
      avatarUri,
    });

    // Broadcast immediately
    await this.broadcastKnownGroups();

    // Push update to renderer
    this.pushDiscoveryUpdate();
  }

  private pushDiscoveryUpdate(): void {
    const joinedTopics = this.topicRepo.findJoined();
    const joinedNames = joinedTopics.map((t) => t.id);
    const groups = this.getDiscoveredGroups(joinedNames);
    this.pushToRenderer("discovery:onUpdate", groups);
  }

  /** Save base64 avatar data to discovery-cache, return filename */
  private cacheAvatar(topicId: string, base64Data: string, ext: string): string | undefined {
    try {
      // Sanitize filename — only allow alphanumeric, dash, underscore, unicode letters
      const safeTopicId = topicId.replace(/[/\\:*?"<>|]/g, "_");
      const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "");
      const filename = `${safeTopicId}.${safeExt}`;
      const filePath = path.join(this.discoveryCacheDir, filename);

      const buffer = Buffer.from(base64Data, "base64");
      // Basic sanity check — reject suspiciously small or large data
      if (buffer.length < 10 || buffer.length > 5 * 1024 * 1024) return undefined;

      fs.writeFileSync(filePath, buffer);
      return filename;
    } catch (err) {
      console.error(`[DiscoveryService] Failed to cache avatar for "${topicId}":`, err);
      return undefined;
    }
  }

  /** Read cached avatar file and return base64 data for broadcast */
  private readCachedAvatar(avatarUri: string): { type: "base64"; data: string; ext: string } | undefined {
    try {
      const filePath = path.join(this.discoveryCacheDir, avatarUri);
      if (!fs.existsSync(filePath)) return undefined;

      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(avatarUri).replace(".", "");
      return {
        type: "base64",
        data: buffer.toString("base64"),
        ext: ext || "jpeg",
      };
    } catch {
      return undefined;
    }
  }
}
