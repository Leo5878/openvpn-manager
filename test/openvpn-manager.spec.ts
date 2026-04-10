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
        statusInterval: 3000,
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
});
