import { describe, expect, it } from "vitest";
import {
  readNotifyPermission,
  REST_DONE_BODY,
  REST_DONE_ICON,
  REST_DONE_TAG,
  REST_DONE_TITLE,
  restDonePayload,
  shouldRequestPermission,
  shouldShowBanner,
  type NotifyPermission,
} from "./restNotify";

describe("readNotifyPermission", () => {
  it("treats a missing Notification API as unsupported, not granted", () => {
    expect(readNotifyPermission(undefined)).toBe("unsupported");
    expect(readNotifyPermission(null)).toBe("unsupported");
  });

  it("passes through the three real permission strings", () => {
    expect(readNotifyPermission({ permission: "default" })).toBe("default");
    expect(readNotifyPermission({ permission: "granted" })).toBe("granted");
    expect(readNotifyPermission({ permission: "denied" })).toBe("denied");
  });

  it("does not treat an unrecognised string as granted", () => {
    expect(readNotifyPermission({ permission: "prompt" })).toBe("unsupported");
  });
});

describe("shouldRequestPermission / shouldShowBanner", () => {
  const cases: {
    permission: NotifyPermission;
    request: boolean;
    banner: boolean;
  }[] = [
    { permission: "default", request: true, banner: false },
    { permission: "granted", request: false, banner: true },
    { permission: "denied", request: false, banner: false },
    { permission: "unsupported", request: false, banner: false },
  ];

  it("asks only on default and notifies only on granted", () => {
    // Denied and missing API must not prompt again or fire a banner; granted must
    // not re-prompt on every Start. Those are the mistakes that are easy to "fix".
    for (const row of cases) {
      expect(shouldRequestPermission(row.permission)).toBe(row.request);
      expect(shouldShowBanner(row.permission)).toBe(row.banner);
    }
  });
});

describe("restDonePayload", () => {
  it("uses a stable tag so later rests replace rather than stack", () => {
    const payload = restDonePayload();
    expect(payload).toEqual({
      title: REST_DONE_TITLE,
      body: REST_DONE_BODY,
      tag: REST_DONE_TAG,
      icon: REST_DONE_ICON,
    });
    expect(payload.tag).toBe("planner-rest-done");
    expect(payload.title).toBe("Rest done");
  });
});
