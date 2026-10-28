import assert from "node:assert/strict";
import {
  checkUnreadCount,
  describeUnusable,
  InboxNavigationTimeoutError,
} from "../src/monitor/checkUnread.js";
import { marketplaceInboxSelectors } from "../src/monitor/selectors.js";

function createPage({
  url = marketplaceInboxSelectors.inboxUrl,
  bodyText = "",
  badgeCount = 0,
  badgeText = "0",
  navigationError = null,
} = {}) {
  const waits = [];
  return {
    waits,
    async goto() {
      if (navigationError) throw navigationError;
    },
    url: () => url,
    locator(selector) {
      if (selector === "body") {
        return { innerText: async () => bodyText };
      }
      return {
        count: async () => badgeCount,
        last: () => ({ innerText: async () => badgeText }),
      };
    },
    waitForTimeout: async (duration) => waits.push(duration),
  };
}

const suspendedRoute = createPage({
  url: "https://www.facebook.com/account/suspended/",
});
assert.equal(await checkUnreadCount(suspendedRoute), null);
assert.deepEqual(suspendedRoute.waits, []);
assert.match(describeUnusable(suspendedRoute.url()), /ditangguhkan/);

const suspendedNotice = createPage({
  bodyText: "We suspended your account",
});
assert.equal(await checkUnreadCount(suspendedNotice), null);
assert.deepEqual(suspendedNotice.waits, []);

const healthyPage = createPage({ badgeCount: 1, badgeText: "3" });
assert.equal(await checkUnreadCount(healthyPage), 3);
assert.deepEqual(healthyPage.waits, [6000]);

const timeout = new Error("Navigation timed out");
timeout.name = "TimeoutError";
await assert.rejects(
  checkUnreadCount(createPage({ navigationError: timeout })),
  InboxNavigationTimeoutError,
);

console.log("OK: akun ditangguhkan dilewati, badge sehat dibaca, timeout dibatasi.");
