import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { VoiceCallService } from "../services/voice-call-service";

export function registerVoiceHandlers(voiceCallService: VoiceCallService): void {
  ipcMain.handle(IPC.VOICE.START_CALL, async (_event, targetAddress: string) => {
    await voiceCallService.startCall(targetAddress);
  });

  ipcMain.handle(IPC.VOICE.ACCEPT_CALL, async (_event, callId: string) => {
    await voiceCallService.acceptCall(callId);
  });

  ipcMain.handle(IPC.VOICE.DECLINE_CALL, async (_event, callId: string) => {
    await voiceCallService.declineCall(callId);
  });

  ipcMain.handle(IPC.VOICE.END_CALL, async () => {
    await voiceCallService.endCall();
  });

  ipcMain.handle(IPC.VOICE.SEND_AUDIO, async (_event, data: ArrayBuffer) => {
    voiceCallService.sendAudio(data);
  });
}
