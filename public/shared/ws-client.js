export function connectTownSocket(onMessage) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/ws`;
  let socket;
  let retries = 0;

  function open() {
    socket = new WebSocket(url);
    socket.addEventListener("message", (ev) => {
      try {
        onMessage(JSON.parse(ev.data));
      } catch {
        /* ignore */
      }
    });
    socket.addEventListener("close", () => {
      retries += 1;
      const wait = Math.min(8000, 400 * retries);
      setTimeout(open, wait);
    });
  }

  open();
  return {
    ping() {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send("ping");
    },
  };
}
