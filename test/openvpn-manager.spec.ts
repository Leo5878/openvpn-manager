import assert from "node:assert";
import { EventEmitter } from "node:events";
import { OpenvpnManager } from "../src/events/openvpn-manager.js";
import { Event } from "../src/Event.js";
import type { Cl } from "../src/events/event-responses.types.js";

class TestManager extends OpenvpnManager {
  public sent: string[] = [];

  constructor(emitter: EventEmitter) {
    super(
      { id: "srv", host: "127.0.0.1", port: 9999 },
      {
        emitter,
        logger: {
          info() {},
          debug() {},
          warn() {},
          error() {},
        },
        debug: false,
        reconnect: "never",
        disconnectMode: "inferred",
        disconnectPollInterval: 3000,
      },
    );
  }

  override writeSocket(command: string) {
    this.sent.push(command);
  }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("OpenvpnManager", () => {
  it("emits client list and disconnect events when clients disappear", async () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const lists: Cl[][] = [];
    const disconnects: string[][] = [];

    emitter.on(Event.CLIENT_LIST, (list: Cl[]) => lists.push(list));
    emitter.on(Event.CLIENT_DISCONNECTION, (ids: string[]) =>
      disconnects.push(ids),
    );

    const statusTwoClients = [
      "TITLE,OpenVPN 2.6.14",
      "CLIENT_LIST,leo-mob,176.59.170.243:53658,10.8.0.2,,204183,249253,2025-09-18 23:10:54,1758226254,UNDEF,7,2,AES-256-GCM",
      "CLIENT_LIST,domodedovo,82.138.49.254:58098,10.8.0.3,,61258,96978,2025-09-18 20:49:38,1758217778,UNDEF,3,0,AES-256-GCM",
      "END",
    ].join("\r\n");

    const statusOneClient = [
      "TITLE,OpenVPN 2.6.14",
      "CLIENT_LIST,leo-mob,176.59.170.243:53658,10.8.0.2,,204183,249253,2025-09-18 23:10:54,1758226254,UNDEF,7,2,AES-256-GCM",
      "END",
    ].join("\r\n");

    emitter.emit("data", statusTwoClients);
    emitter.emit("data", statusOneClient);

    await tick();
    assert.strictEqual(lists.length, 2);
    assert.strictEqual(lists[0].length, 2);
    assert.strictEqual(lists[1].length, 1);
    assert.deepStrictEqual(disconnects, [["domodedovo"]]);
  });

  it("writes status command when disconnect notification arrives", () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    emitter.emit("data", ">NOTIFY:info,remote-exit,EXIT");
    assert.deepStrictEqual(manager.sent, ["status 2\r\n"]);
  });

  it("emits bytecount events", () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.BYTECOUNT_CLI, (data) => events.push(data));

    emitter.emit("data", ">BYTECOUNT_CLI:7,10,20");

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].id, "srv");
    assert.strictEqual(events[0].bytesReceived, 10);
    assert.strictEqual(events[0].bytesSent, 20);
    assert.strictEqual(events[0].clientID, 7);
  });

  it("emits log events", () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.LOG, (data) => events.push(data));

    emitter.emit("data", ">LOG:1710000000,I,Initialization Sequence Completed");

    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0], {
      id: "srv",
      timestamp: 1710000000,
      flags: "I",
      message: "Initialization Sequence Completed",
    });
  });

  it("emits bytecount events in client mode", () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.BYTECOUNT, (data) => events.push(data));

    emitter.emit("data", ">BYTECOUNT:10,20");

    assert.deepStrictEqual(events, [
      {
        id: "srv",
        bytesReceived: 10,
        bytesSent: 20,
      },
    ]);
  });

  it("emits hold events", () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.HOLD, (data) => events.push(data));

    emitter.emit("data", ">HOLD:Waiting for hold release");

    assert.deepStrictEqual(events, [
      {
        id: "srv",
        message: "Waiting for hold release",
      },
    ]);
  });

  it("emits password events", () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.PASSWORD, (data) => events.push(data));

    emitter.emit("data", ">PASSWORD:Need 'Auth' username/password");

    assert.deepStrictEqual(events, [
      {
        id: "srv",
        message: "Need 'Auth' username/password",
        token: "Auth",
        isNeed: true,
        isVerificationFailed: false,
        staticChallenge: undefined,
      },
    ]);
  });

  it("emits rsa-sign events", () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.RSA_SIGN, (data) => events.push(data));

    emitter.emit("data", ">RSA_SIGN:Zm9v");

    assert.deepStrictEqual(events, [
      {
        id: "srv",
        base64Data: "Zm9v",
      },
    ]);
  });

  it("emits client:connect with keyId for CONNECT", async () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.CLIENT_CONNECT, (data) => events.push(data));

    const raw = [
      ">CLIENT:CONNECT,7,42",
      ">CLIENT:ENV,common_name=bob",
      ">CLIENT:ENV,untrusted_ip=192.168.1.1",
      ">CLIENT:ENV,untrusted_port=1111",
      ">CLIENT:ENV,trusted_ip=192.168.1.1",
      ">CLIENT:ENV,trusted_port=1111",
      ">CLIENT:ENV,n_clients=1",
      ">CLIENT:ENV,time_unix=0",
      ">CLIENT:ENV,time_ascii=1970-01-01 00:00:00",
      ">CLIENT:ENV,ifconfig_pool_netmask=255.255.255.0",
      ">CLIENT:ENV,ifconfig_pool_remote_ip=10.8.0.2",
      ">CLIENT:ENV,IV_SSO=",
      ">CLIENT:ENV,IV_GUI_VER=",
      ">CLIENT:ENV,IV_COMP_STUB=0",
      ">CLIENT:ENV,IV_COMP_STUBv2=0",
      ">CLIENT:ENV,IV_LZO_STUB=0",
      ">CLIENT:ENV,IV_PROTO=0",
      ">CLIENT:ENV,IV_CIPHERS=",
      ">CLIENT:ENV,IV_NCP=",
      ">CLIENT:ENV,IV_MTU=1500",
      ">CLIENT:ENV,IV_TCPNL=0",
      ">CLIENT:ENV,IV_PLAT=linux",
      ">CLIENT:ENV,IV_VER=2.6.0",
      ">CLIENT:ENV,tls_id_0=CN",
      ">CLIENT:ENV,X509_0_CN=bob",
      ">CLIENT:ENV,tls_id_1=CN",
      ">CLIENT:ENV,X509_1_CN=server",
      ">CLIENT:ENV,remote_port_1=1111",
      ">CLIENT:ENV,local_port_1=2222",
      ">CLIENT:ENV,proto_1=udp",
      ">CLIENT:ENV,daemon_pid=1",
      ">CLIENT:ENV,daemon_start_time=0",
      ">CLIENT:ENV,daemon_log_redirect=0",
      ">CLIENT:ENV,daemon=0",
      ">CLIENT:ENV,verb=3",
      ">CLIENT:ENV,config=cfg",
      ">CLIENT:ENV,ifconfig_local=10.8.0.1",
      ">CLIENT:ENV,ifconfig_netmask=255.255.255.0",
      ">CLIENT:ENV,script_context=init",
      ">CLIENT:ENV,tun_mtu=1500",
      ">CLIENT:ENV,dev=tun0",
      ">CLIENT:ENV,dev_type=tun",
      ">CLIENT:ENV,END",
    ].join("\r\n");

    emitter.emit("data", raw);
    await tick();

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].phase, "CONNECT");
    assert.strictEqual(events[0].clientID, 7);
    assert.strictEqual(events[0].keyId, 42);
    assert.strictEqual(events[0].commonName, "bob");
  });

  it("builds CONNECT payload without established-only fields", async () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.CLIENT_CONNECT, (data) => events.push(data));

    const raw = [
      ">CLIENT:CONNECT,0,1",
      ">CLIENT:ENV,n_clients=0",
      ">CLIENT:ENV,password=",
      ">CLIENT:ENV,untrusted_port=38317",
      ">CLIENT:ENV,untrusted_ip=65.108.93.18",
      ">CLIENT:ENV,common_name=leo-laptop",
      ">CLIENT:ENV,IV_PROTO=2974",
      ">CLIENT:ENV,IV_CIPHERS=AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305",
      ">CLIENT:ENV,IV_NCP=2",
      ">CLIENT:ENV,IV_MTU=1600",
      ">CLIENT:ENV,IV_TCPNL=1",
      ">CLIENT:ENV,IV_PLAT=linux",
      ">CLIENT:ENV,IV_VER=2.7.0",
      ">CLIENT:ENV,tls_id_0=CN=leo-laptop",
      ">CLIENT:ENV,X509_0_CN=leo-laptop",
      ">CLIENT:ENV,tls_id_1=CN=host-fi-h1",
      ">CLIENT:ENV,X509_1_CN=host-fi-h1",
      ">CLIENT:ENV,local_port_1=1140",
      ">CLIENT:ENV,proto_1=udp",
      ">CLIENT:ENV,remote_port_1=1140",
      ">CLIENT:ENV,daemon_pid=1599998",
      ">CLIENT:ENV,daemon_start_time=1777025348",
      ">CLIENT:ENV,daemon_log_redirect=0",
      ">CLIENT:ENV,daemon=0",
      ">CLIENT:ENV,verb=6",
      ">CLIENT:ENV,config=host-fi-h1.conf",
      ">CLIENT:ENV,ifconfig_local=10.9.2.1",
      ">CLIENT:ENV,ifconfig_netmask=255.255.255.0",
      ">CLIENT:ENV,script_context=init",
      ">CLIENT:ENV,tun_mtu=1500",
      ">CLIENT:ENV,dev=tun0",
      ">CLIENT:ENV,dev_type=tun",
      ">CLIENT:ENV,redirect_gateway=0",
      ">CLIENT:ENV,END",
    ].join("\r\n");

    emitter.emit("data", raw);
    await tick();

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].phase, "CONNECT");
    assert.strictEqual(events[0].keyId, 1);
    assert.strictEqual(events[0].clientID, 0);
    assert.strictEqual(events[0].commonName, "leo-laptop");
    assert.strictEqual(events[0].untrustedPort, 38317);
    assert.strictEqual(events[0].localPort1, 1140);
    assert.strictEqual(events[0].remotePort1, 1140);
    assert.strictEqual(events[0].proto1, "udp");
    assert.strictEqual(events[0].timeUnix, undefined);
    assert.strictEqual(events[0].trustedPort, undefined);
  });

  it("emits raw disconnect event from CLIENT:DISCONNECT", async () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.CLIENT_DISCONNECT_EVENT, (data) => events.push(data));

    const raw = [
      ">CLIENT:DISCONNECT,7",
      ">CLIENT:ENV,common_name=bob",
      ">CLIENT:ENV,untrusted_ip=192.168.1.1",
      ">CLIENT:ENV,untrusted_port=1111",
      ">CLIENT:ENV,trusted_ip=192.168.1.1",
      ">CLIENT:ENV,trusted_port=1111",
      ">CLIENT:ENV,n_clients=1",
      ">CLIENT:ENV,time_unix=0",
      ">CLIENT:ENV,time_ascii=1970-01-01 00:00:00",
      ">CLIENT:ENV,ifconfig_pool_netmask=255.255.255.0",
      ">CLIENT:ENV,ifconfig_pool_remote_ip=10.8.0.2",
      ">CLIENT:ENV,IV_SSO=",
      ">CLIENT:ENV,IV_GUI_VER=",
      ">CLIENT:ENV,IV_COMP_STUB=0",
      ">CLIENT:ENV,IV_COMP_STUBv2=0",
      ">CLIENT:ENV,IV_LZO_STUB=0",
      ">CLIENT:ENV,IV_PROTO=0",
      ">CLIENT:ENV,IV_CIPHERS=",
      ">CLIENT:ENV,IV_NCP=",
      ">CLIENT:ENV,IV_MTU=1500",
      ">CLIENT:ENV,IV_TCPNL=0",
      ">CLIENT:ENV,IV_PLAT=linux",
      ">CLIENT:ENV,IV_VER=2.6.0",
      ">CLIENT:ENV,tls_id_0=CN",
      ">CLIENT:ENV,X509_0_CN=bob",
      ">CLIENT:ENV,tls_id_1=CN",
      ">CLIENT:ENV,X509_1_CN=server",
      ">CLIENT:ENV,remote_port_1=1111",
      ">CLIENT:ENV,local_port_1=2222",
      ">CLIENT:ENV,proto_1=udp",
      ">CLIENT:ENV,daemon_pid=1",
      ">CLIENT:ENV,daemon_start_time=0",
      ">CLIENT:ENV,daemon_log_redirect=0",
      ">CLIENT:ENV,daemon=0",
      ">CLIENT:ENV,verb=3",
      ">CLIENT:ENV,config=cfg",
      ">CLIENT:ENV,ifconfig_local=10.8.0.1",
      ">CLIENT:ENV,ifconfig_netmask=255.255.255.0",
      ">CLIENT:ENV,script_context=init",
      ">CLIENT:ENV,tun_mtu=1500",
      ">CLIENT:ENV,dev=tun0",
      ">CLIENT:ENV,dev_type=tun",
      ">CLIENT:ENV,END",
    ].join("\r\n");

    emitter.emit("data", raw);
    await tick();

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].phase, "DISCONNECT");
    assert.strictEqual(events[0].clientID, 7);
    assert.strictEqual(events[0].commonName, "bob");
  });

  it("maps DISCONNECT bytes counters when provided", async () => {
    const emitter = new EventEmitter();
    const manager = new TestManager(emitter);

    const events: any[] = [];
    emitter.on(Event.CLIENT_DISCONNECT, (data) => events.push(data));

    const raw = [
      ">CLIENT:DISCONNECT,7",
      ">CLIENT:ENV,bytes_sent=5456",
      ">CLIENT:ENV,bytes_received=5459",
      ">CLIENT:ENV,trusted_port=48578",
      ">CLIENT:ENV,trusted_ip=65.108.93.18",
      ">CLIENT:ENV,ifconfig_pool_netmask=255.255.255.0",
      ">CLIENT:ENV,ifconfig_pool_remote_ip=10.9.2.2",
      ">CLIENT:ENV,time_unix=1777033425",
      ">CLIENT:ENV,time_ascii=2026-04-24 15:23:45",
      ">CLIENT:ENV,common_name=leo-laptop",
      ">CLIENT:ENV,END",
    ].join("\r\n");

    emitter.emit("data", raw);
    await tick();

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].phase, "DISCONNECT");
    assert.strictEqual(events[0].bytesSent, 5456);
    assert.strictEqual(events[0].bytesReceived, 5459);
    assert.strictEqual(events[0].trustedPort, 48578);
    assert.strictEqual(events[0].ifconfigPoolRemoteIp, "10.9.2.2");
  });
});
