import { create } from "zustand";
import type { Topic, TopicSubscriber } from "../../shared/types";

interface TopicState {
  topics: Topic[];
  loadTopics: () => Promise<void>;
  createTopic: (name: string) => Promise<void>;
  joinTopic: (name: string) => Promise<void>;
  leaveTopic: (name: string) => Promise<void>;
  getSubscribers: (name: string) => Promise<TopicSubscriber[]>;
  handleTopicUpdate: (topic: Topic) => void;
  handleTopicDelete: (topicId: string) => void;
}

export const useTopicStore = create<TopicState>((set) => ({
  topics: [],

  loadTopics: async () => {
    const topics = await window.dchat.topic.list();
    set({ topics });
  },

  createTopic: async (name: string) => {
    await window.dchat.topic.create(name);
    const topics = await window.dchat.topic.list();
    set({ topics });
  },

  joinTopic: async (name: string) => {
    await window.dchat.topic.join(name);
    const topics = await window.dchat.topic.list();
    set({ topics });
  },

  leaveTopic: async (name: string) => {
    await window.dchat.topic.leave(name);
    const topics = await window.dchat.topic.list();
    set({ topics });
  },

  getSubscribers: async (name: string) => {
    return window.dchat.topic.getSubscribers(name);
  },

  handleTopicUpdate: (topic: Topic) => {
    set((state) => {
      const idx = state.topics.findIndex((t) => t.id === topic.id);
      let updated: Topic[];
      if (idx >= 0) {
        updated = [...state.topics];
        updated[idx] = topic;
      } else {
        updated = [topic, ...state.topics];
      }
      return { topics: updated };
    });
  },

  handleTopicDelete: (topicId: string) => {
    set((state) => ({
      topics: state.topics.filter((t) => t.id !== topicId),
    }));
  },
}));
