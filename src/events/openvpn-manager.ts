import { EventEmitter } from "node:events";
import { Event, InternalEvent } from "../Event.js";
import type { Connect, LoggerAdapter, Options } from "../core/core.js";
import type {
  ByteCount,
  ByteCountServer,
  ClientCommonEvent,
  Cl,
  ClientConnectEvent,
  ClientEnvEvent,
  ClientEstablishedEvent,
  ClientEnvDisconnectEvent,
  ConnectionEvent,
  EventMap,
  HoldMessage,
  InternalEventMap,
  LogMessage,
  PasswordMessage,
  RawConnectionClient,
  RsaSignRequest,
} from "./event-responses.types.js";
import {
  ClassifiedLine,
  classifyLog,
  parseByteCount,
  parseByteCountServer,
  parseClientMetadata,
  parseClientStatus,
  parseHold,
  parseLog,
  parsePassword,
  parseRsaSign,
} from "../parse.js";
import { Commands } from "../command/commands.js";

type EventKey = (typeof Event)[keyof typeof Event] & keyof InternalEventMap;
type Listener<T> = [T] extends [void] ? () => void : (args: T) => void;
export type DisconnectMode = "reported" | "inferred" | "fallback" | undefined;
export type Opts = {
  emitter?: EventEmitter;
  /**
   * Controls disconnect signal source:
   * - reported: only raw `>CLIENT:DISCONNECT` events
   * - inferred: only manager diff from `status 2`
   * - fallback: both (reported + inferred)
   */
  disconnectMode?: DisconnectMode;
  /** Polling interval for inferred/fallback modes. */
  disconnectPollInterval?: number;
  logger?: LoggerAdapter;
} & Options;

type ColCl = Set<string>;

export class OpenvpnManager extends Commands {
  private eventEmitter: EventEmitter;
  private openVPNServer: Connect;
  private getStatusInterval?: NodeJS.Timeout;
  // public commands:

  private active: ColCl = new Set();

  constructor(openVPNServer: Connect, opts?: Opts) {
    const emitter: EventEmitter = opts?.emitter ?? new EventEmitter();
    super(openVPNServer, emitter, { logger: opts?.logger });
    // this.commands = new OpenvpnCommands(openVPNServer, emitter, { logger: opts?.logger })
    // TODO убрать и оставить тот, что в connect
    this.eventEmitter = emitter;
    this.openVPNServer = openVPNServer;

    this.handleCommand();
    const disconnectMode: DisconnectMode =
      opts?.disconnectMode !== undefined
        ? (opts?.disconnectMode ?? "inferred")
        : undefined;
    if (disconnectMode === undefined) {
      this.logger.warn("Disconnected mode is disabled");
      return;
    }

    const pollInterval = opts?.disconnectPollInterval ?? 5000;
    const isInferredEnabled =
      disconnectMode === "inferred" || disconnectMode === "fallback";

    if (isInferredEnabled) {
      // Subscribe immediately so `client:list` events from tests (or external emitters)
      // can produce `client:disconnect` diffs even before a real socket connection.
      this.dispatchDisconnectClient();

      void this.ready.then(() => {
        this.logger.debug("Try check disconnected client is enabled");
        this.getStatusUsersInterval(pollInterval);
      });
    }
  }

  on<K extends EventKey>(event: K, listener: Listener<EventMap[K]>): void {
    this.eventEmitter.on(event, listener);
  }

  off<K extends EventKey>(event: K, listener: Listener<EventMap[K]>): void {
    this.eventEmitter.off(event, listener);
  }

  once<K extends EventKey>(event: K, listener: Listener<EventMap[K]>): void {
    this.eventEmitter.once(event, listener);
  }

  /**
   * Отправляет команду `status 2` раз в *n* время для openvpn
   *
   * Подробнее в документации [openvpn](https://openvpn.net/community-docs/management-interface.html)
   * @param interval
   * @private
   */
  private getStatusUsersInterval(interval: number) {
    this.writeSocket("status 2\r\n");
    this.getStatusInterval = setInterval(() => {
      if (this.debug) {
        this.logger.debug(`Get status interval: running`);
      }

      this.writeSocket("status 2\r\n");
    }, interval);
  }

  private handleCommand() {
    this.eventEmitter.on("data", async (data: string) => {
      if (this.debug) {
        this.logger.debug(data);
      }

      const classify = classifyLog(data);
      await this.handleClassifiedLine(classify);

      // Нужен, чтобы запустить проверку того, не отключился ли клиент
      this.eventEmitter.emit(InternalEvent.CLIENT_END);
    });
  }

  private async handleClassifiedLine(classify: ClassifiedLine) {
    if (classify.type === "unknown") {
      return classify;
    }

    if (classify.type === "event") {
      switch (classify.event) {
        case "BYTECOUNT":
          this.byteCount(parseByteCountServer(classify.raw));
          break;
        case "ESTABLISHED":
          this.establishedClient(
            this.processClient("ESTABLISHED", classify.raw),
          );
          break;
        case "CONNECT":
        case "REAUTH":
          this.connectClient(this.processClient(classify.event, classify.raw));
          break;
        case "DISCONNECT":
          this.disconnectClient(
            this.processClient(classify.event, classify.raw),
          );
          break;
        case "REMOTE_EXIT":
          this.logger.debug("write socket status. Is event disconnected");
          this.writeSocket("status 2\r\n");
          break;
        case "BYTECOUNT_CLI":
          this.byteCountCli(parseByteCount(classify.raw));
          break;
        case "HOLD":
          this.holdMessage(parseHold(classify.raw));
          break;
        case "LOG":
          this.logMessage(parseLog(classify.raw));
          break;
        case "PASSWORD":
          this.passwordMessage(parsePassword(classify.raw));
          break;
        case "RSA_SIGN":
          this.rsaSignRequest(parseRsaSign(classify.raw));
          break;
      }
    }

    if (classify.type === "data") {
      switch (classify.event) {
        case "CLIENT_LIST":
          this.parseClientList(parseClientStatus(classify.raw));
          break;
      }
    }
  }

  private dispatchDisconnectClient() {
    const prev: Set<string> = new Set();

    this.eventEmitter.on(Event.CLIENT_LIST, (data: Cl[]) => {
      for (const { commonName } of data) {
        if (commonName === "UNDEF") {
          continue;
        }

        prev.add(commonName);
      }
    });

    this.eventEmitter.on(InternalEvent.CLIENT_END, () => {
      const diff = this.diffDisconnected(prev, this.active);

      if (diff.length === 0) {
        return;
      }

      prev.forEach((client) => prev.delete(client));

      this.eventEmitter.emit(Event.CLIENT_DISCONNECT_INFERRED, diff);
    });
  }

  private diffDisconnected(prev: ColCl, curr: ColCl) {
    return [...prev].filter((id) => !curr.has(id));
  }

  private byteCountCli(res: number[]) {
    if (res.length == 3) {
      const data: ByteCount = {
        id: this.openVPNServer.id,
        clientID: res[0],
        bytesReceived: res[1], // from client
        bytesSent: res[2], // to client
      };

      this.eventEmitter.emit(Event.BYTECOUNT_CLI, data);
    }
  }

  private byteCount([bytesReceived, bytesSent]: number[]) {
    const data: ByteCountServer = {
      id: this.openVPNServer.id,
      bytesReceived,
      bytesSent,
    };

    this.eventEmitter.emit(Event.BYTECOUNT, data);
  }

  private holdMessage(message: string) {
    const data: HoldMessage = {
      id: this.openVPNServer.id,
      message,
    };

    this.eventEmitter.emit(Event.HOLD, data);
  }

  private logMessage(res: Omit<LogMessage, "id">) {
    const data: LogMessage = {
      id: this.openVPNServer.id,
      timestamp: res.timestamp,
      flags: res.flags,
      message: res.message,
    };

    this.eventEmitter.emit(Event.LOG, data);
  }

  private passwordMessage(res: Omit<PasswordMessage, "id">) {
    const data: PasswordMessage = {
      id: this.openVPNServer.id,
      message: res.message,
      token: res.token,
      isNeed: res.isNeed,
      isVerificationFailed: res.isVerificationFailed,
      staticChallenge: res.staticChallenge,
    };

    this.eventEmitter.emit(Event.PASSWORD, data);
  }

  private rsaSignRequest(res: Omit<RsaSignRequest, "id">) {
    const data: RsaSignRequest = {
      id: this.openVPNServer.id,
      base64Data: res.base64Data,
    };

    this.eventEmitter.emit(Event.RSA_SIGN, data);
  }

  // TODO move to file commands
  private parseClientList(listUser: string[][]) {
    try {
      // TODO подумать, чтобы убрать
      this.active.clear();
      const arrayList: Cl[] = [];

      for (const item of listUser) {
        const data: Cl = {
          id: this.openVPNServer.id,
          commonName: item[1],
          realAddress: item[2],
          virtualAddress: item[3],
          virtualIPv6Address: item[4],
          bytesReceived: Number(item[5]),
          bytesSent: Number(item[6]),
          connectedSince: item[7],
          connectedSinceEpoch: Number(item[8]),
          username: item[9],
          clientID: Number(item[10]),
          peerID: Number(item[11]),
          dataChannelCipher: item[12],
        };

        arrayList.push(data);
        this.active.add(data.commonName);
      }

      this.eventEmitter.emit(Event.CLIENT_LIST, arrayList);
    } catch (e) {
      this.logger.error(e);
    }
  }

  private preProcessEnv(response: string[][]): {
    common: ClientCommonEvent;
    session: ConnectionEvent;
    keyId?: number;
  } {
    const oc = Object.fromEntries(response) as RawConnectionClient;
    const keyId = oc?.keyId !== undefined ? Number(oc.keyId) : undefined;
    const common = this.buildCommonClient(oc);
    const session = this.buildSessionClient(common, oc);

    return { common, session, keyId };
  }

  private toNumber(value?: string): number | undefined {
    if (value === undefined || value === "") return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  }

  private buildCommonClient(oc: RawConnectionClient): ClientCommonEvent {
    return {
      id: this.openVPNServer.id,
      clientID: Number(oc.clientID),
      connection: oc.connection,
      n_clients: oc.n_clients, // client counter
      commonName: oc.common_name ?? "",
      IV: {
        sso: oc.IV_SSO ?? "",
        guiVer: oc.IV_GUI_VER ?? "",
        compStub: this.toNumber(oc.IV_COMP_STUB) ?? 0,
        compStubV2: this.toNumber(oc.IV_COMP_STUBv2) ?? 0,
        lzoStub: this.toNumber(oc.IV_LZO_STUB) ?? 0,
        proto: this.toNumber(oc.IV_PROTO) ?? 0,
        ciphers: oc.IV_CIPHERS?.split(":"),
        ncp: oc.IV_NCP ?? "",
        mtu: oc.IV_MTU ?? "",
        tcpnl: oc.IV_TCPNL ?? "",
        plat: oc.IV_PLAT ?? "unknown",
        ver: oc.IV_VER ?? "",
      },
      untrustedPort: this.toNumber(oc.untrusted_port),
      untrustedIp: oc.untrusted_ip,
      tlsId0: oc.tls_id_0,
      x509_0_cn: oc.X509_0_CN,
      tlsId1: oc.tls_id_1,
      x509_1_cn: oc.X509_1_CN,
      remotePort1: this.toNumber(oc.remote_port_1),
      localPort1: this.toNumber(oc.local_port_1),
      proto1: oc.proto_1,
      daemonPid: oc.daemon_pid,
      daemonStartTime: this.toNumber(oc.daemon_start_time),
      daemonLogRedirect: oc.daemon_log_redirect,
      daemon: oc.daemon,
      verb: this.toNumber(oc.verb),
      config: oc.config,
      ifconfigLocal: oc.ifconfig_local,
      ifconfigNetmask: oc.ifconfig_netmask,
      scriptContext: oc.script_context,
      tunMtu: this.toNumber(oc.tun_mtu),
      dev: oc.dev,
      devType: oc.dev_type,
    };
  }

  private buildSessionClient(
    common: ClientCommonEvent,
    oc: RawConnectionClient,
  ): ConnectionEvent {
    return {
      ...common,
      timeUnix: this.toNumber(oc.time_unix),
      timeAscii: oc.time_ascii ? new Date(oc.time_ascii) : undefined,
      ifconfigPollNetmask: oc.ifconfig_pool_netmask,
      ifconfigPoolRemoteIp: oc.ifconfig_pool_remote_ip, // client ip
      trustedPort: this.toNumber(oc.trusted_port),
      trustedIp: oc.trusted_ip,
      bytesSent: this.toNumber(oc.bytes_sent),
      bytesReceived: this.toNumber(oc.bytes_received),
    };
  }

  /**
   * Notify new client connection **("CONNECT")** or existing client TLS session
   * renegotiation **("REAUTH")**. Information about the client is provided
   * by a list of environmental variables which are documented in the OpenVPN
   * man page. The environmental variables passed are equivalent to those
   * that would be passed to an *--auth-user-pass-verify script*.
   * @param client
   * @private
   */
  private connectClient(client: ClientConnectEvent) {
    this.eventEmitter.emit(Event.CLIENT_CONNECT, client);
  }

  /**
   * Notify successful client authentication and session initiation.
   * Called after **CONNECT**.
   * @param client
   * @private
   */
  private establishedClient(client: ClientEstablishedEvent) {
    this.eventEmitter.emit(Event.CLIENT_ESTABLISHED, client);
  }

  /**
   * Notify existing client disconnection.  The environmental variables passed
   * are equivalent to those that would be passed to a *--client-disconnect script*.
   * @param client
   * @private
   */
  private disconnectClient(client: ClientEnvDisconnectEvent) {
    // Raw OpenVPN disconnect event payload.
    this.active.delete(client.commonName);
    this.eventEmitter.emit(Event.CLIENT_DISCONNECT, client);
  }

  private processClient(
    phase: "CONNECT" | "REAUTH",
    raw: string,
  ): ClientConnectEvent;
  private processClient(
    phase: "ESTABLISHED",
    raw: string,
  ): ClientEstablishedEvent;
  private processClient(
    phase: "DISCONNECT",
    raw: string,
  ): ClientEnvDisconnectEvent;
  private processClient(
    phase: ClientEnvEvent["phase"],
    raw: string,
  ): ClientEnvEvent {
    const { common, session, keyId } = this.preProcessEnv(
      parseClientMetadata(raw),
    );

    if (phase === "CONNECT" || phase === "REAUTH") {
      if (keyId === undefined || Number.isNaN(keyId)) {
        throw new Error(
          `OpenVPN protocol violation: missing KID for ${phase} (CID=${common.clientID}).`,
        );
      }
      return { ...common, phase, keyId };
    }

    return { ...session, phase } as ClientEnvEvent;
  }

  /**
   * Метод завершает корректно работу всех таймеров, слушателей и сокетов
   */
  public async shutdown() {
    if (this.getStatusInterval) {
      clearTimeout(this.getStatusInterval);
    }

    this.writeSocket("quit\r\n");
    await this.endSocket();
    this.eventEmitter.removeAllListeners();
  }
}
