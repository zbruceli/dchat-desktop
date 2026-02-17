import { useEffect } from "react";
import { useClientStore } from "../stores/client-store";
import { useChatStore } from "../stores/chat-store";
import { useSessionStore } from "../stores/session-store";
import { useTopicStore } from "../stores/topic-store";

export function useIpcSubscriptions(): void {
  const setStatus = useClientStore((s) => s.setStatus);
  const handleIncomingMessage = useChatStore((s) => s.handleIncomingMessage);
  const handleSessionUpdate = useSessionStore((s) => s.handleSessionUpdate);
  const handleSessionDelete = useSessionStore((s) => s.handleSessionDelete);
  const handleTopicUpdate = useTopicStore((s) => s.handleTopicUpdate);
  const handleTopicDelete = useTopicStore((s) => s.handleTopicDelete);

  useEffect(() => {
    const unsubStatus = window.dchat.client.onStatusChange(setStatus);
    const unsubMessage = window.dchat.chat.onMessage(handleIncomingMessage);
    const unsubSession = window.dchat.session.onUpdate(handleSessionUpdate);
    const unsubSessionDel = window.dchat.session.onDelete(handleSessionDelete);
    const unsubTopic = window.dchat.topic.onUpdate(handleTopicUpdate);
    const unsubTopicDel = window.dchat.topic.onDelete(handleTopicDelete);

    return () => {
      unsubStatus();
      unsubMessage();
      unsubSession();
      unsubSessionDel();
      unsubTopic();
      unsubTopicDel();
    };
  }, [setStatus, handleIncomingMessage, handleSessionUpdate, handleSessionDelete, handleTopicUpdate, handleTopicDelete]);
}
