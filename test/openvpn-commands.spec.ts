import assert from "node:assert";
import { EventEmitter } from "node:events";
import { Commands } from "../src/command/commands.js";
import { OpenvpnCommandError } from "../src/error.js";

class TestCommands extends Commands {
  public sent: string[] = [];

  constructor(emitter: EventEmitter) {
    super({ id: "test", host: "127.0.0.1", port: 9999 }, emitter, {
      debug: false,
      reconnect: "never",
      logger: {
        info() {},
        debug() {},
        warn() {},
        error() {},
      },
    });
  }

  override writeSocket(command: string) {
    this.sent.push(command);
  }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("OpenvpnCommands", () => {
  it("resolves command responses and writes to socket", async () => {
    const emitter = new EventEmitter();
    const commands = new TestCommands(emitter);

    const promise = commands.killClientByCn("alice");
    emitter.emit("data", "SUCCESS: killed");
    const result = await promise;

    assert.deepStrictEqual(result, {
      success: true,
      raw: "SUCCESS: killed",
    });
    assert.deepStrictEqual(commands.sent, ["kill alice\r\n"]);
  });

  it("ignores status responses and waits for the next command reply", async () => {
    const emitter = new EventEmitter();
    const commands = new TestCommands(emitter);

    let resolved = false;
    const promise = commands.killClientByAddress("1.2.3.4:1194").then(() => {
      resolved = true;
    });

    emitter.emit("data", "TITLE,OpenVPN 2.6.0");
    await tick();
    assert.strictEqual(resolved, false);

    emitter.emit("data", "SUCCESS: killed");
    await promise;
    assert.strictEqual(resolved, true);
  });

  it("ignores async management events while waiting for a command reply", async () => {
    const emitter = new EventEmitter();
    const commands = new TestCommands(emitter);

    let resolved = false;
    const promise = commands.killClientByCn("alice").then(() => {
      resolved = true;
    });

    emitter.emit("data", ">BYTECOUNT_CLI:7,10,20");
    emitter.emit("data", ">LOG:1710000000,I,Initialization Sequence Completed");
    await tick();
    assert.strictEqual(resolved, false);

    emitter.emit("data", "SUCCESS: killed");
    await promise;
    assert.strictEqual(resolved, true);
  });

  it("rejects when server replies with ERROR", async () => {
    const emitter = new EventEmitter();
    const commands = new TestCommands(emitter);

    const promise = commands.killClientByCn("bob");
    emitter.emit("data", "ERROR: permission denied");

    await assert.rejects(promise, (err: OpenvpnCommandError) => {
      assert.strictEqual(err.name, "OpenvpnCommandError");
      assert.strictEqual(err.message, "permission denied");
      assert.strictEqual(err.raw, "ERROR: permission denied");
      return true;
    });
  });

  it("parses version and pid responses", async () => {
    const emitter = new EventEmitter();
    const commands = new TestCommands(emitter);

    const versionPromise = commands.getVersion();
    emitter.emit(
      "data",
      "OpenVPN Version: OpenVPN 2.6.14 x86_64\nManagement Interface Version: 5\nEND",
    );
    const version = await versionPromise;
    assert.strictEqual(version.managementVersion, "5");
    assert.strictEqual(version.openvpnVersion, "OpenVPN 2.6.14 x86_64");

    const pidPromise = commands.getPid();
    emitter.emit("data", "SUCCESS: pid=12345");
    const pid = await pidPromise;
    assert.strictEqual(pid.pid, 12345);
  });

  it("parses load stats and log responses", async () => {
    const emitter = new EventEmitter();
    const commands = new TestCommands(emitter);

    const statsPromise = commands.getLoadStats();
    emitter.emit("data", "SUCCESS: nclients=2,bytesin=10,bytesout=20");
    const stats = await statsPromise;
    assert.deepStrictEqual(stats, {
      nClients: 2,
      bytesIn: 10,
      bytesOut: 20,
      raw: "SUCCESS: nclients=2,bytesin=10,bytesout=20",
    });

    const logPromise = commands.getLog(3);
    emitter.emit("data", "line1\nline2\nEND\n");
    const log = await logPromise;
    assert.deepStrictEqual(log, ["line1", "line2"]);
  });

  it("handles auth flow with two sequential commands", async () => {
    const emitter = new EventEmitter();
    const commands = new TestCommands(emitter);

    const authPromise = commands.sendAuth("Auth", "user", "pass");
    emitter.emit("data", "SUCCESS: username ok");
    await tick();
    emitter.emit("data", "SUCCESS: password ok");

    const result = await authPromise;
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(commands.sent, [
      'username "Auth" user\r\n',
      'password "Auth" pass\r\n',
    ]);
  });
});
