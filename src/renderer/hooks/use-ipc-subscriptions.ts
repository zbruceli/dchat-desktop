import { useEffect } from "react";
import { useClientStore } from "../stores/client-store";
import { useChatStore } from "../stores/chat-store";
import { useSessionStore } from "../stores/session-store";

export function useIpcSubscriptions(): void {
  const setStatus = useClientStore((s) => s.setStatus);
  const handleIncomingMessage = useChatStore((s) => s.handleIncomingMessage);
  const handleSessionUpdate = useSessionStore((s) => s.handleSessionUpdate);

  useEffect(() => {
    const unsubStatus = window.dchat.client.onStatusChange(setStatus);
    const unsubMessage = window.dchat.chat.onMessage(handleIncomingMessage);
    const unsubSession = window.dchat.session.onUpdate(handleSessionUpdate);

    return () => {
      unsubStatus();
      unsubMessage();
      unsubSession();
    };
  }, [setStatus, handleIncomingMessage, handleSessionUpdate]);
}
