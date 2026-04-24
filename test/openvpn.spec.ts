import assert from "node:assert";
import {
  classifyLog,
  parseClientMetadata,
  parseClientStatus,
  parseHold,
  parseLog,
  parsePassword,
  parseRsaSign,
} from "../src/parse.js";

describe("classifyLine", () => {
  const clients = `TITLE,OpenVPN 2.6.14 [git:makepkg/f588592ee6c6323b+] x86_64-pc-linux-gnu [SSL (OpenSSL)] [LZO] [LZ4] [EPOLL] [PKCS11] [MH/PKTINFO] [AEAD] [DCO] built on Apr  2 2025\r
TIME,2025-09-18 23:11:49,1758226309\r
HEADER,CLIENT_LIST,Common Name,Real Address,Virtual Address,Virtual IPv6 Address,Bytes Received,Bytes Sent,Connected Since,Connected Since (time_t),Username,Client ID,Peer ID,Data Channel Cipher\r
CLIENT_LIST,leo-mob,176.59.170.243:53658,10.8.0.2,,204183,249253,2025-09-18 23:10:54,1758226254,UNDEF,7,2,AES-256-GCM\r
CLIENT_LIST,domodedovo,82.138.49.254:58098,10.8.0.3,,61258,96978,2025-09-18 20:49:38,1758217778,UNDEF,3,0,AES-256-GCM\r
HEADER,ROUTING_TABLE,Virtual Address,Common Name,Real Address,Last Ref,Last Ref (time_t)\r
ROUTING_TABLE,10.8.0.2,leo-mob,176.59.170.243:53658,2025-09-18 23:11:49,1758226309\r
ROUTING_TABLE,10.8.0.3,domodedovo,82.138.49.254:58098,2025-09-18 23:11:42,1758226302\r
GLOBAL_STATS,Max bcast/mcast queue length,0\r
GLOBAL_STATS,dco_enabled,0\r
END`;

  it("должен вернуть client для CLIENT_LIST", () => {
    const cl = classifyLog(clients);
    assert.deepStrictEqual(cl, {
      type: "data",
      event: "CLIENT_LIST",
      raw: clients,
    });
  });

  it('должен вернуть command для строки с ">"', () => {
    const line = ">BYTECOUNT_CLI:7,1843580,58892570";
    const cl = classifyLog(line);
    assert.deepStrictEqual(cl, {
      type: "event",
      event: "BYTECOUNT_CLI",
      raw: line,
    });
  });

  it("должен распознать LOG", () => {
    const line = ">LOG:1710000000,I,Initialization Sequence Completed";
    const cl = classifyLog(line);
    assert.deepStrictEqual(cl, {
      type: "event",
      event: "LOG",
      raw: line,
    });
  });

  it("должен распознать BYTECOUNT", () => {
    const line = ">BYTECOUNT:10,20";
    const cl = classifyLog(line);
    assert.deepStrictEqual(cl, {
      type: "event",
      event: "BYTECOUNT",
      raw: line,
    });
  });

  it("должен распознать HOLD", () => {
    const line = ">HOLD:Waiting for hold release";
    const cl = classifyLog(line);
    assert.deepStrictEqual(cl, {
      type: "event",
      event: "HOLD",
      raw: line,
    });
  });

  it("должен распознать PASSWORD", () => {
    const line = ">PASSWORD:Need 'Auth' username/password";
    const cl = classifyLog(line);
    assert.deepStrictEqual(cl, {
      type: "event",
      event: "PASSWORD",
      raw: line,
    });
  });

  it("должен распознать RSA_SIGN", () => {
    const line = ">RSA_SIGN:Zm9v";
    const cl = classifyLog(line);
    assert.deepStrictEqual(cl, {
      type: "event",
      event: "RSA_SIGN",
      raw: line,
    });
  });

  it("должен вернуть event для ENV строки", () => {
    const line = ">CLIENT:ESTABLISHED,10";
    const cl = classifyLog(line);
    assert.deepStrictEqual(cl, {
      type: "event",
      event: "ESTABLISHED",
      raw: line,
    });
  });

  it("должен вернуть unknown если строка не подходит", () => {
    const line = "TITLE,OpenVPN 2.6.14";
    assert.deepStrictEqual(classifyLog(line), {
      type: "unknown",
      raw: line,
    });
  });

  it("должен распознать CLIENT_DISCONNECT", () => {
    const line = ">NOTIFY:info,remote-exit,EXIT";
    const cl = classifyLog(line);
    assert.deepStrictEqual(cl, {
      type: "event",
      event: "REMOTE_EXIT",
      raw: "unknown",
    });
  });

  it("parseClientStatus returns array with two clients", () => {
    const { raw } = classifyLog(clients);
    const parsed = parseClientStatus(raw);

    assert.strictEqual(Array.isArray(parsed), true);
    assert.strictEqual(parsed.length, 2);
  });

  it("parseClientMetadata parses key-value pairs", () => {
    const raw = [
      ">CLIENT:CONNECT,1",
      "untrusted_ip=192.168.1.1",
      "common_name=bob",
      ">CLIENT:ENV,END",
    ].join("\r\n");

    const parsed = parseClientMetadata(raw);
    assert.deepStrictEqual(parsed, [
      ["clientID", "1"],
      ["untrusted_ip", "192.168.1.1"],
      ["common_name", "bob"],
    ]);
  });

  it("parseClientMetadata parses CID and KID for CONNECT/REAUTH", () => {
    const raw = [
      ">CLIENT:CONNECT,7,42",
      "common_name=bob",
      ">CLIENT:ENV,END",
    ].join("\r\n");

    const parsed = parseClientMetadata(raw);
    assert.deepStrictEqual(parsed, [
      ["clientID", "7"],
      ["keyId", "42"],
      ["common_name", "bob"],
    ]);
  });

  it("parseLog parses timestamp, flags and message", () => {
    assert.deepStrictEqual(
      parseLog(">LOG:1710000000,W,client disconnected unexpectedly"),
      {
        timestamp: 1710000000,
        flags: "W",
        message: "client disconnected unexpectedly",
      },
    );
  });

  it("parseHold parses message", () => {
    assert.strictEqual(
      parseHold(">HOLD:Waiting for hold release"),
      "Waiting for hold release",
    );
  });

  it("parsePassword parses challenge request", () => {
    assert.deepStrictEqual(
      parsePassword(">PASSWORD:Need 'Auth' username/password SC:1,Enter PIN"),
      {
        message: "Need 'Auth' username/password SC:1,Enter PIN",
        token: "Auth",
        isNeed: true,
        isVerificationFailed: false,
        staticChallenge: {
          echo: true,
          text: "Enter PIN",
        },
      },
    );
  });

  it("parsePassword parses verification failure", () => {
    assert.deepStrictEqual(
      parsePassword(">PASSWORD:Verification Failed: 'Private Key'"),
      {
        message: "Verification Failed: 'Private Key'",
        token: "Private Key",
        isNeed: false,
        isVerificationFailed: true,
        staticChallenge: undefined,
      },
    );
  });

  it("parseRsaSign parses payload", () => {
    assert.deepStrictEqual(parseRsaSign(">RSA_SIGN:Zm9v"), {
      base64Data: "Zm9v",
    });
  });
});
