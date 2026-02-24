import type { NknClientService } from "./nkn-client-service";
import type { TopicRepository } from "../db/repositories/topic-repository";
import type { TopicSubscriberRepository } from "../db/repositories/topic-subscriber-repository";
import type { DiscoveredGroupRepository } from "../db/repositories/discovered-group-repository";
import type { DiscoveredGroup, DiscoveryBroadcastMessage } from "../../shared/types";
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

  constructor(
    private nknClient: NknClientService,
    private topicRepo: TopicRepository,
    private subscriberRepo: TopicSubscriberRepository,
    private discoveredGroupRepo: DiscoveredGroupRepository,
    private pushToRenderer: (channel: string, data: unknown) => void,
  ) {
    this.discoveryTopicHash = genTopicHash(DISCOVERY_TOPIC_NAME);
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
    const groupMap = new Map<string, { n: string; d?: string; c?: string; s: number }>();

    for (const topic of joinedTopics) {
      groupMap.set(topic.id, {
        n: topic.id,
        s: topic.memberCount,
      });
    }

    for (const group of discoveredGroups) {
      if (!groupMap.has(group.topicName)) {
        groupMap.set(group.topicName, {
          n: group.topicName,
          d: group.description,
          c: group.category,
          s: group.subscriberCount,
        });
      }
    }

    const groups = Array.from(groupMap.values()).slice(0, MAX_BROADCAST_GROUPS);
    if (groups.length === 0) return;

    const broadcastMsg: DiscoveryBroadcastMessage = {
      contentType: "discovery:broadcast",
      groups,
      sender: myAddress,
      timestamp: Date.now(),
    };

    // Send to all subscribers on the discovery topic
    try {
      const subscribers = await this.nknClient.getSubscribers(this.discoveryTopicHash);
      const dests = subscribers.filter((addr) => addr !== myAddress);
      if (dests.length > 0) {
        this.nknClient.sendToMultiple(dests, JSON.stringify(broadcastMsg));
        console.log(`[DiscoveryService] Broadcast ${groups.length} groups to ${dests.length} peers`);
      }
    } catch (err) {
      console.error("[DiscoveryService] Failed to broadcast:", err);
    }
  }

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

  private pushDiscoveryUpdate(): void {
    const joinedTopics = this.topicRepo.findJoined();
    const joinedNames = joinedTopics.map((t) => t.id);
    const groups = this.getDiscoveredGroups(joinedNames);
    this.pushToRenderer("discovery:onUpdate", groups);
  }
}
