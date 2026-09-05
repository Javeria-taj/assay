"use client";

import { useEffect, useState } from "react";

/**
 * The countdown runs off the server's clock, never the browser's.
 *
 * This is not pedantry. The number on screen is telling a merchant whether a
 * contractual right is still hers, and a laptop whose clock is a few hours out
 * would quietly tell her she has time when she does not. So the server's
 * `serverNow` is taken as truth on arrival, the offset from local time is
 * measured once, and every tick after that is local elapsed time added to the
 * server's instant.
 *
 * Returns the current server time in epoch ms, ticking once a second.
 */
export function useServerClock(serverNow: number): number {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    /* Measured once, at mount. The browser's clock is used only to count
     * elapsed time, never to establish what time it is. */
    const offset = serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset);

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [serverNow]);

  return now;
}
