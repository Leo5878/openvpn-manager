type Event = "CLIENT_CONNECTED" | "BYTECOUNT_CLI" | "CLIENT_LIST";
export type ClassifiedLine =
  | { type: "data"; event: Event; raw: string }
  | { type: "event"; event: Event; raw: string }
  | { type: "event"; event: "CLIENT_DISCONNECT"; raw: "unknown" }
  | { type: "unknown"; raw: string };

export function classifyLog(event: string): ClassifiedLine {
  const eventReg = new RegExp(/>\w+:ENV/);

  if (eventReg.test(event)) {
    return { type: "event", event: "CLIENT_CONNECTED", raw: event };
  }

  if (event.includes(">BYTECOUNT_CLI")) {
    return { type: "event", event: "BYTECOUNT_CLI", raw: event };
  }

  if (event.includes(">NOTIFY:info,remote-exit,EXIT")) {
    return { type: "event", event: "CLIENT_DISCONNECT", raw: "unknown" };
  }

  if (event.includes("CLIENT_LIST")) {
    return { type: "data", event: "CLIENT_LIST", raw: event };
  }

  return { type: "unknown", raw: event };
}

export function parseClientMetadata(raw: string) {
  return raw
    .replace(">NOTIFY:info,remote-exit,EXIT", "")
    .replace(/>CLIENT:ESTABLISHED,\d/, "")
    .replace(">CLIENT:ENV,END", "")
    .trim()
    .split("\r\n")
    .map((i) => i.slice(i.indexOf(",") + 1).split("="));
}

export function parseClientStatus(clientsListRaw: string) {
  return clientsListRaw
    .split("\r\n")
    .filter((r) => r.startsWith("CLIENT_LIST"))
    .map((i) => i.split(","));
}
