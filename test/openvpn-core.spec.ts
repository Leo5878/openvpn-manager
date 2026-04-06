import assert from "node:assert";
import { EventEmitter } from "node:events";
import { OpenvpnCore } from "../src/core.js";

class FakeSocket extends EventEmitter {
  public writes: string[] = [];
  public keepAliveEnabled: boolean | null = null;
  public ended = false;

  write(command: string, cb?: () => void) {
    this.writes.push(command);
    if (cb) cb();
  }

  setKeepAlive(enable: boolean) {
    this.keepAliveEnabled = enable;
  }

  end(cb?: () => void) {
    this.ended = true;
    if (cb) cb();
  }
}

class TestCore extends OpenvpnCore {
  public fakeSocket: FakeSocket;

  constructor(emitter: EventEmitter) {
    super(
      { id: "srv", host: "127.0.0.1", port: 9999 },
      emitter,
      {
        debug: false,
        reconnect: "never",
        logger: {
          info() {},
          debug() {},
          warn() {},
          error() {},
        },
      },
    );
    this.fakeSocket = new FakeSocket();
    this.socket = this.fakeSocket as any;
  }
}

describe("OpenvpnCore.setHandlers", () => {
  it("emits SUCCESS/ERROR lines as data", () => {
    const emitter = new EventEmitter();
    const core = new TestCore(emitter);

    const received: string[] = [];
    emitter.on("data", (data: string) => received.push(data));

    core.setHandlers();

    core.fakeSocket.emit("data", Buffer.from("SUCCESS: ok\n"));
    core.fakeSocket.emit("data", Buffer.from("ERROR: fail\n"));

    assert.deepStrictEqual(received, ["SUCCESS: ok", "ERROR: fail"]);
  });

  it("emits block responses when END marker is received", () => {
    const emitter = new EventEmitter();
    const core = new TestCore(emitter);

    const received: string[] = [];
    emitter.on("data", (data: string) => received.push(data));

    core.setHandlers();

    core.fakeSocket.emit("data", Buffer.from("TITLE,OpenVPN 2.6.0\n"));
    core.fakeSocket.emit("data", Buffer.from("END\n"));

    assert.deepStrictEqual(received, ["TITLE,OpenVPN 2.6.0"]);
  });

  it("buffers multi-line blocks before END", () => {
    const emitter = new EventEmitter();
    const core = new TestCore(emitter);

    const received: string[] = [];
    emitter.on("data", (data: string) => received.push(data));

    core.setHandlers();

    core.fakeSocket.emit(
      "data",
      Buffer.from("TITLE,OpenVPN 2.6.0\nCLIENT_LIST,alice,1.2.3.4\n"),
    );
    core.fakeSocket.emit("data", Buffer.from("END\n"));

    assert.deepStrictEqual(received, [
      "TITLE,OpenVPN 2.6.0\r\nCLIENT_LIST,alice,1.2.3.4",
    ]);
  });

  it("sets keep-alive on connect", () => {
    const emitter = new EventEmitter();
    const core = new TestCore(emitter);

    core.setHandlers();
    core.fakeSocket.emit("connect");

    assert.strictEqual(core.fakeSocket.keepAliveEnabled, true);
  });

  it("emits async notifications without END", () => {
    const emitter = new EventEmitter();
    const core = new TestCore(emitter);

    const received: string[] = [];
    emitter.on("data", (data: string) => received.push(data));

    core.setHandlers();
    core.fakeSocket.emit("data", Buffer.from(">BYTECOUNT_CLI:7,10,20\n"));

    assert.deepStrictEqual(received, [">BYTECOUNT_CLI:7,10,20"]);
  });

  it("buffers client env events until >CLIENT:ENV,END", () => {
    const emitter = new EventEmitter();
    const core = new TestCore(emitter);

    const received: string[] = [];
    emitter.on("data", (data: string) => received.push(data));

    core.setHandlers();
    core.fakeSocket.emit("data", Buffer.from(">CLIENT:CONNECT,1\n"));
    core.fakeSocket.emit("data", Buffer.from(">CLIENT:ENV,dev=tun0\n"));
    core.fakeSocket.emit("data", Buffer.from(">CLIENT:ENV,END\n"));

    assert.deepStrictEqual(received, [
      ">CLIENT:CONNECT,1\r\n>CLIENT:ENV,dev=tun0\r\n>CLIENT:ENV,END",
    ]);
  });
});

describe("OpenvpnCore.endSocket", () => {
  it("ends the socket", async () => {
    const emitter = new EventEmitter();
    const core = new TestCore(emitter);

    await core.endSocket();
    assert.strictEqual(core.fakeSocket.ended, true);
  });
});
