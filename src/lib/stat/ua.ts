import { UAParser } from "ua-parser-js";
import { isbot } from "isbot";

export type DeviceType = "desktop" | "mobile" | "tablette";

export interface UaInfo {
  os: string | null;
  browser: string | null;
  deviceType: DeviceType;
  isBot: boolean;
}

export function parseUa(ua: string | null, webdriver = false): UaInfo {
  const raw = ua ?? "";
  const r = new UAParser(raw).getResult();
  const t = r.device.type;
  const deviceType: DeviceType =
    t === "tablet" ? "tablette" : t === "mobile" || t === "wearable" ? "mobile" : "desktop";
  return {
    os: r.os.name ?? null,
    browser: r.browser.name ?? null,
    deviceType,
    isBot: webdriver || raw.length === 0 || isbot(raw),
  };
}
