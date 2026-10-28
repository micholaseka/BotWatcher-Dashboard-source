import assert from "node:assert/strict";
import { createServer } from "node:http";
import { HermesWebhook } from "../src/notifications/hermesWebhook.js";

const requests = [];
const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    requests.push({
      method: request.method,
      contentType: request.headers["content-type"],
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    response.writeHead(204);
    response.end();
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const { port } = server.address();
  const webhook = new HermesWebhook({
    url: `http://127.0.0.1:${port}/webhooks/BotWatcher-Dashboard`,
  });
  const account = {
    accountId: "account-7",
    accountName: "Toko Kediri",
  };

  assert.equal(
    await webhook.notifyIfNewInboxMessages({
      ...account,
      unreadCount: 3,
      previousUnreadCount: null,
    }),
    true,
  );
  assert.equal(
    await webhook.notifyIfNewInboxMessages({
      ...account,
      unreadCount: 3,
      previousUnreadCount: 3,
    }),
    false,
  );
  assert.equal(
    await webhook.notifyIfNewInboxMessages({
      ...account,
      unreadCount: 5,
      previousUnreadCount: 3,
    }),
    true,
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, "POST");
  assert.match(requests[0].contentType, /application\/json/);
  assert.deepEqual(requests[0].body, {
    signal: "wake",
    event: "new_inbox_messages",
    accountId: "account-7",
    accountName: "Toko Kediri",
    hasNewMessages: true,
    newMessageCount: 3,
    unreadCount: 3,
  });
  assert.equal(requests[1].body.newMessageCount, 2);
  assert.equal(requests[1].body.unreadCount, 5);
  console.log("OK: Hermes menerima POST untuk pesan baru dan skip jumlah yang tidak bertambah.");
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
