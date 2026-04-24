type Event =
  | "BYTECOUNT"
  | "BYTECOUNT_CLI"
  | "CLIENT_LIST"
  | "HOLD"
  | "LOG"
  | "PASSWORD"
  | "RSA_SIGN";

type EventConnection = "ESTABLISHED" | "CONNECT" | "DISCONNECT" | "REAUTH";

export type ClassifiedLine =
  | { type: "data"; event: Event; raw: string }
  | { type: "event"; event: Event | EventConnection; raw: string }
  | { type: "event"; event: "REMOTE_EXIT"; raw: "unknown" }
  | { type: "unknown"; raw: string };

export function classifyLog(event: string): ClassifiedLine {
  const eventReg = />CLIENT:(\w+)/;

  // TODO проверить, что не будет пересечений с другими статусами
  if (eventReg.test(event)) {
    const nt = eventReg.exec(event)?.[1];
    if (nt) {
      return { type: "event", event: nt as EventConnection, raw: event };
    }
  }

  if (event.includes(">BYTECOUNT_CLI")) {
    return { type: "event", event: "BYTECOUNT_CLI", raw: event };
  }

  if (event.includes("CLIENT_LIST")) {
    return { type: "data", event: "CLIENT_LIST", raw: event };
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
    return { type: "event", event: "REMOTE_EXIT", raw: "unknown" };
  }

  return { type: "unknown", raw: event };
}

/**
 * (1) Notify new client connection ("CONNECT") or existing client TLS session
 *     renegotiation ("REAUTH").  Information about the client is provided
 *     by a list of environmental variables which are documented in the OpenVPN
 *     man page.  The environmental variables passed are equivalent to those
 *     that would be passed to an --auth-user-pass-verify script.
 *
 *     >CLIENT:CONNECT|REAUTH,{CID},{KID} -- один тип 0
 *     >CLIENT:ENV,name1=val1
 *     >CLIENT:ENV,name2=val2
 *     >CLIENT:ENV,...
 *     >CLIENT:ENV,END
 *
 * (2) Notify successful client authentication and session initiation.
 *     Called after CONNECT.
 *
 *     >CLIENT:ESTABLISHED,{CID} -- один тип 1
 *     >CLIENT:ENV,name1=val1
 *     >CLIENT:ENV,name2=val2
 *     >CLIENT:ENV,...
 *     >CLIENT:ENV,END
 *
 * (3) Notify existing client disconnection.  The environmental variables passed
 *     are equivalent to those that would be passed to a --client-disconnect
 *     script.
 *
 *     >CLIENT:DISCONNECT,{CID} -- один тип 1
 *     >CLIENT:ENV,name1=val1
 *     >CLIENT:ENV,name2=val2
 *     >CLIENT:ENV,...
 *     >CLIENT:ENV,END
 *
 * (4) Notify that a particular virtual address or subnet
 *     is now associated with a specific client.
 *
 *     >CLIENT:ADDRESS,{CID},{ADDR},{PRI}
 * OpenVPN doc: {@link https://openvpn.net/community-docs/management-interface.html#management-interface|Management Interface}
 * @param raw
 */

export function parseClientMetadata(raw: string) {
  return (
    raw
      // TODO check
      // .replace(">NOTIFY:info,remote-exit,EXIT", "")
      .replace(
        />CLIENT:(?:CONNECT|REAUTH|ESTABLISHED|DISCONNECT),(\d+)(?:,(\d+))?/,
        (_, clientID, keyId) =>
          keyId !== undefined
            ? `clientID=${clientID}\r\nkeyId=${keyId}`
            : `clientID=${clientID}`,
      )
      .replace(">CLIENT:ENV,END", "")
      .trim()
      .split(/\r?\n/)
      .map((i) => i.slice(i.indexOf(",") + 1).split("="))
  );
}

export function parseClientStatus(clientsListRaw: string) {
  return clientsListRaw
    .split(/\r?\n/)
    .filter((r) => r.startsWith("CLIENT_LIST"))
    .map((i) => i.split(","));
}

export function parseByteCount(raw: string) {
  return raw
    .substring(raw.indexOf(":") + 1)
    .split(",")
    .map(Number);
}

export function parseByteCountServer(raw: string) {
  return raw
    .substring(raw.indexOf(":") + 1)
    .split(",")
    .map(Number);
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
