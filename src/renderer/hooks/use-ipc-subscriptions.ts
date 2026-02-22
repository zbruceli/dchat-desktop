import { useEffect } from "react";
import { useClientStore } from "../stores/client-store";
import { useChatStore } from "../stores/chat-store";
import { useContactStore } from "../stores/contact-store";
import { useSessionStore } from "../stores/session-store";
import { useTopicStore } from "../stores/topic-store";
import { usePrivateGroupStore } from "../stores/private-group-store";
import { useProfileStore } from "../stores/profile-store";

export function useIpcSubscriptions(): void {
  const setStatus = useClientStore((s) => s.setStatus);
  const handleIncomingMessage = useChatStore((s) => s.handleIncomingMessage);
  const handleContactUpdate = useContactStore((s) => s.handleContactUpdate);
  const handleSessionUpdate = useSessionStore((s) => s.handleSessionUpdate);
  const handleSessionDelete = useSessionStore((s) => s.handleSessionDelete);
  const handleTopicUpdate = useTopicStore((s) => s.handleTopicUpdate);
  const handleTopicDelete = useTopicStore((s) => s.handleTopicDelete);
  const handleGroupUpdate = usePrivateGroupStore((s) => s.handleGroupUpdate);
  const handleGroupDelete = usePrivateGroupStore((s) => s.handleGroupDelete);
  const setProfile = useProfileStore((s) => s.setProfile);
  const setActiveSession = useChatStore((s) => s.setActiveSession);

  useEffect(() => {
    const unsubStatus = window.dchat.client.onStatusChange(setStatus);
    const unsubMessage = window.dchat.chat.onMessage(handleIncomingMessage);
    const unsubContact = window.dchat.contact.onUpdate(handleContactUpdate);
    const unsubSession = window.dchat.session.onUpdate(handleSessionUpdate);
    const unsubSessionDel = window.dchat.session.onDelete(handleSessionDelete);
    const unsubTopic = window.dchat.topic.onUpdate(handleTopicUpdate);
    const unsubTopicDel = window.dchat.topic.onDelete(handleTopicDelete);
    const unsubGroup = window.dchat.privateGroup.onUpdate(handleGroupUpdate);
    const unsubGroupDel = window.dchat.privateGroup.onDelete(handleGroupDelete);
    const unsubProfile = window.dchat.profile.onUpdate(setProfile);
    const unsubNavigate = window.dchat.chat.onNavigateToSession(setActiveSession);

    return () => {
      unsubStatus();
      unsubMessage();
      unsubContact();
      unsubSession();
      unsubSessionDel();
      unsubTopic();
      unsubTopicDel();
      unsubGroup();
      unsubGroupDel();
      unsubProfile();
      unsubNavigate();
    };
  }, [setStatus, handleIncomingMessage, handleContactUpdate, handleSessionUpdate, handleSessionDelete, handleTopicUpdate, handleTopicDelete, handleGroupUpdate, handleGroupDelete, setProfile, setActiveSession]);
}
