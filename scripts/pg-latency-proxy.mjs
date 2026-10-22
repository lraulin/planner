import net from "node:net";

/**
 * A TCP proxy in front of Postgres that delays traffic and counts round trips.
 *
 * Local Postgres answers in well under a millisecond, so a loader that awaits five queries
 * in a row is exactly as fast here as one that issues them together. In production each of
 * those waits is a network round trip to Neon. This puts the latency back, on demand, so the
 * difference can be seen before it ships: `scripts/route-round-trips.mjs` drives it.
 *
 * It counts by reading the frontend half of the wire protocol. A `Sync` or a simple `Query`
 * ends one statement; a `Flush` is the extra trip postgres.js made to describe an unprepared
 * statement before it would bind its parameters.
 */
export function startLatencyProxy({
  listenPort = 5433,
  targetHost = "127.0.0.1",
  targetPort = 5432,
} = {}) {
  let delayMs = 0;
  let counts = { statements: 0, describes: 0 };

  const later = (send) => (delayMs === 0 ? send() : setTimeout(send, delayMs));

  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, targetHost);
    let pending = Buffer.alloc(0);
    let startupSeen = false;

    client.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        // The startup packet is the one message with no type byte in front of its length.
        if (!startupSeen) {
          if (pending.length < 4) break;
          const length = pending.readInt32BE(0);
          if (pending.length < length) break;
          pending = pending.subarray(length);
          startupSeen = true;
          continue;
        }
        if (pending.length < 5) break;
        const length = pending.readInt32BE(1);
        if (pending.length < 1 + length) break;
        const type = String.fromCharCode(pending[0]);
        if (type === "S" || type === "Q") counts.statements++;
        else if (type === "H") counts.describes++;
        pending = pending.subarray(1 + length);
      }
      later(() => upstream.write(chunk));
    });
    upstream.on("data", (chunk) => later(() => client.write(chunk)));

    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    for (const socket of [client, upstream]) {
      socket.on("error", close);
      socket.on("close", close);
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, "127.0.0.1", () =>
      resolve({
        /** One-way delay; a round trip costs twice this. */
        setDelay(ms) {
          delayMs = ms;
        },
        /** Counts since the last call, and start again from zero. */
        take() {
          const taken = counts;
          counts = { statements: 0, describes: 0 };
          return taken;
        },
        close: () => server.close(),
      }),
    );
  });
}
