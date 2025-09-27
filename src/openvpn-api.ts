import { EventEmitter } from "node:events";
import { Event, InternalEvent } from "./Event";
import { Logger, OpenvpnCore, Options } from "./connect";
import {
  ByteCount,
  Cl,
  ConnectionClient,
  EventMap,
  InternalEventMap,
  RawConnectionClient,
} from "./event-responses.types";
import { Connect } from "./connect";
import {
  ClassifiedLine,
  classifyLog,
  parseClientMetadata,
  parseClientStatus,
} from "./parse";

type EventKey = (typeof Event)[keyof typeof Event] & InternalEventMap;
export type Opts = {
  emitter?: EventEmitter;
  statusInterval?: number;
  logger?: Logger;
} & Options;

export class OpenvpnApi extends OpenvpnCore {
  private eventEmitter: EventEmitter;
  private openVPNServer: Connect;
  private getStatusInterval: NodeJS.Timeout;

  private active: Set<string> = new Set<string>();

  constructor(openVPNServer: Connect, opts?: Opts) {
    const emitter: EventEmitter = opts?.emitter ?? new EventEmitter();
    super(openVPNServer, emitter, { logger: opts?.logger });
    // TODO убрать и оставить тот, что в connect
    this.eventEmitter = emitter;
    this.openVPNServer = openVPNServer;

    this.handleCommand();
    this.ready.then(() => {
      this.getStatusUsersInterval(opts?.statusInterval ?? 5000);
    });

    this.dispatchDisconnectClient();
  }

  on<K extends EventKey>(event: K, listener: (arg: EventMap[K]) => void) {
    this.eventEmitter.on(event, listener);
  }

  off<K extends EventKey>(event: K, listener: (arg: EventMap[K]) => void) {
    this.eventEmitter.off(event, listener);
  }

  once<K extends EventKey>(event: K, listener: (arg: EventMap[K]) => void) {
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
    this.eventEmitter.on("data", (data: string) => {
      if (this.debug) {
        console.debug(data);
      }

      const classify = classifyLog(data);
      this.handleClassifiedLine(classify);

      // Нужен, чтобы запустить проверку того, не отключился ли клиент
      this.eventEmitter.emit(InternalEvent.CLIENT_END);
    });
  }

  private handleClassifiedLine(classify: ClassifiedLine) {
    if (classify.type === "unknown") {
      return classify;
    }

    if (classify.type === "event") {
      switch (classify.event) {
        case "BYTECOUNT_CLI":
          this.byteCountCli(classify.raw);
          break;
        case "CLIENT_CONNECTED":
          this.env(parseClientMetadata(classify.raw));
          break;
        case "CLIENT_DISCONNECT":
          this.logger.debug("write socket status. Is event disconnected");
          this.writeSocket("status 2\r\n");
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
      data.forEach(({ commonName }) => {
        prev.add(commonName);
      });
    });

    this.eventEmitter.on(InternalEvent.CLIENT_END, () => {
      const diff = this.diffDisconnected(prev, this.active);

      if (diff.length <= 0) {
        return;
      }

      prev.forEach((client) => {
        prev.delete(client);
      });

      this.eventEmitter.emit(Event.CLIENT_DISCONNECTION, diff);
    });
  }

  private diffDisconnected(prev: Set<string>, curr: Set<string>) {
    return [...prev.keys()].filter((id) => !curr.has(id));
  }

  private byteCountCli(commandResponse: string) {
    const byteCountArr = commandResponse.split(",");

    if (byteCountArr.length == 3) {
      const data: ByteCount = {
        id: this.openVPNServer.id,
        clientID: Number(byteCountArr[0]),
        bytesReceived: Number(byteCountArr[1]), // from client
        bytesSent: Number(byteCountArr[2]), // to client
      };

      this.eventEmitter.emit(Event.BYTECOUNT_CLI, data);
    }
  }

  private parseClientList(listUser: string[][]) {
    try {
      this.active.clear();
      const arrayList = [];

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

  private env(response: string[][]) {
    const oc = Object.fromEntries(response) as RawConnectionClient;
    const client: ConnectionClient = {
      id: this.openVPNServer.id,
      connection: oc.connection,
      n_clients: oc.n_clients, // client counter
      timeUnix: Number(oc.time_unix),
      timeAscii: new Date(oc.time_ascii), // date for human
      ifconfigPollNetmask: oc.ifconfig_pool_netmask,
      ifconfigPoolRemoteIp: oc.ifconfig_pool_remote_ip, // client ip
      trustedPort: Number(oc.trusted_port),
      trustedIp: oc.trusted_ip,
      commonName: oc.common_name,
      IV: {
        sso: oc.IV_SSO,
        guiVer: oc.IV_GUI_VER,
        compStub: Number(oc.IV_COMP_STUB),
        compStubV2: Number(oc.IV_COMP_STUBv2),
        lzoStub: Number(oc.IV_LZO_STUB),
        proto: Number(oc.IV_PROTO),
        ciphers: oc.IV_CIPHERS?.split(":"),
        ncp: oc.IV_NCP,
        mtu: oc.IV_MTU,
        tcpnl: oc.IV_TCPNL,
        plat: oc.IV_PLAT,
        ver: oc.IV_VER,
      },
      untrustedPort: Number(oc.untrusted_port),
      untrustedIp: oc.untrusted_ip,
      tlsId0: oc.tls_id_0,
      x509_0_cn: oc.X509_0_CN,
      tlsId1: oc.tls_id_1,
      x509_1_cn: oc.X509_1_CN,
      remotePort1: Number(oc.remote_port_1),
      localPort1: Number(oc.local_port_1),
      proto1: oc.proto_1 as "tcp" | "udp",
      daemonPid: oc.daemon_pid,
      daemonStartTime: Number(oc.daemon_start_time),
      daemonLogRedirect: oc.daemon_log_redirect,
      daemon: oc.daemon,
      verb: Number(oc.verb),
      config: oc.config,
      ifconfigLocal: oc.ifconfig_local,
      ifconfigNetmask: oc.ifconfig_netmask,
      scriptContext: oc.script_context,
      tunMtu: Number(oc.tun_mtu),
      dev: oc.dev,
      devType: oc.dev_type,
    };

    this.active.add(client.commonName);
    this.eventEmitter.emit(Event.CLIENT_CONNECTION, client);
  }

  /**
   * Метод завершает корректно работу всех таймеров, слушателей и сокетов
   */
  public async shutdown() {
    clearTimeout(this.getStatusInterval);
    await this.endSocket();
    this.eventEmitter.removeAllListeners();
  }
}

// const event = new EventEmitter();
// const api = new OpenvpnApi({
//   id: "1",
//   host: "127.0.0.1",
//   port: 7505,
//   timeout: 2000,
// });
// {
// logger: Log() as unknown as Logger,
// },
// event,
// );

// api.connect().then((e) => e);
// .catch((err) => {
//   console.log(err);
// });
// api.handleComman

// event.on("bytecount_cli", (data) => {
//   console.log("bytecount_cli", data);
// });

// api.on("client:connection", (data) => {
//   console.log("connection", data);
// });
//
// api.on("client:list", (data) => {
//   console.log("list", data);
// });

// api.on("client:disconnect", (data) => {
//   console.log("disconnected", data);
// });
//
// api.on("socket:error", (err) => {
//   console.log(err);
//   console.log(err);
// });
