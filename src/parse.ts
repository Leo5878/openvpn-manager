type Event =
  | "ESTABLISHED"
  | "CONNECT"
  | "BYTECOUNT"
  | "BYTECOUNT_CLI"
  | "CLIENT_LIST"
  | "HOLD"
  | "LOG"
  | "PASSWORD"
  | "RSA_SIGN";

export type ClassifiedLine =
  | { type: "data"; event: Event; raw: string }
  | { type: "event"; event: Event; raw: string }
  | { type: "event"; event: "CLIENT_DISCONNECT"; raw: "unknown" }
  | { type: "unknown"; raw: string };

export function classifyLog(event: string): ClassifiedLine {
  const eventReg = new RegExp(/>\w+:ENV/);

  if (eventReg.test(event)) {
    return { type: "event", event: "ESTABLISHED", raw: event };
  }

  if (event.includes(">BYTECOUNT_CLI")) {
    return { type: "event", event: "BYTECOUNT_CLI", raw: event };
  }

  if (event.includes("CLIENT_LIST")) {
    return { type: "data", event: "CLIENT_LIST", raw: event };
  }

  if (event.includes(">CLIENT:CONNECT")) {
    return { type: "event", event: "CONNECT", raw: event };
  }

  if (event.includes(">BYTECOUNT:")) {
    return { type: "event", event: "BYTECOUNT", raw: event };
  }

  if (event.includes(">HOLD:")) {
    return { type: "event", event: "HOLD", raw: event };
  }

  if (event.includes(">LOG:")) {
    return { type: "event", event: "LOG", raw: event };
  }

  if (event.includes(">PASSWORD:")) {
    return { type: "event", event: "PASSWORD", raw: event };
  }

  if (event.includes(">RSA_SIGN:")) {
    return { type: "event", event: "RSA_SIGN", raw: event };
  }

  if (event.includes(">NOTIFY:info,remote-exit,EXIT")) {
    return { type: "event", event: "CLIENT_DISCONNECT", raw: "unknown" };
  }

  return { type: "unknown", raw: event };
}

export function parseClientMetadata(raw: string) {
  return raw
    .replace(">NOTIFY:info,remote-exit,EXIT", "")
    .replace(/>CLIENT:(ESTABLISHED|CONNECT|REAUTH),(\d+)/, "clientID=$2")
    .replace(">CLIENT:ENV,END", "")
    .trim()
    .split("\r\n")
    .map((i) => i
        .slice(i.indexOf(",") + 1)
        .split("=")
    );
}

export function parseClientStatus(clientsListRaw: string) {
  return clientsListRaw
    .split("\r\n")
    .filter((r) => r.startsWith("CLIENT_LIST"))
    .map((i) => i.split(","));
}

export function parseByteCount(raw: string) {
  return raw
      .substring(raw.indexOf(':') + 1)
      .split(",")
      .map(Number)
}

export function parseByteCountServer(raw: string) {
  const [bytesReceived, bytesSent] = raw
    .substring(raw.indexOf(":") + 1)
    .split(",")
    .map(Number);

  return {
    bytesReceived,
    bytesSent,
  };
}

export function parseLog(raw: string) {
  const payload = raw.substring(raw.indexOf(":") + 1);
  const firstComma = payload.indexOf(",");
  const secondComma = payload.indexOf(",", firstComma + 1);

  return {
    timestamp: Number(payload.slice(0, firstComma)),
    flags: payload.slice(firstComma + 1, secondComma),
    message: payload.slice(secondComma + 1),
  };
}

export function parseHold(raw: string) {
  return raw.substring(raw.indexOf(":") + 1);
}

export function parsePassword(raw: string) {
  const message = raw.substring(raw.indexOf(":") + 1);
  const needMatch = message.match(/^Need '([^']+)'/);
  const failedMatch = message.match(/^Verification Failed: '([^']+)'/);
  const staticChallengeMatch = message.match(/ SC:([01]),(.*)$/);

  return {
    message,
    token: needMatch?.[1] ?? failedMatch?.[1],
    isNeed: Boolean(needMatch),
    isVerificationFailed: Boolean(failedMatch),
    staticChallenge: staticChallengeMatch
      ? {
          echo: staticChallengeMatch[1] === "1",
          text: staticChallengeMatch[2],
        }
      : undefined,
  };
}

export function parseRsaSign(raw: string) {
  return {
    base64Data: raw.substring(raw.indexOf(":") + 1),
  };
}
