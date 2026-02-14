import type { DchatAPI } from "../preload/index";

declare global {
  interface Window {
    dchat: DchatAPI;
  }
}
