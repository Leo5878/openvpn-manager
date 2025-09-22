import { classifyLog, parseClientStatus } from "./parse";

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
    expect(classifyLog(clients)).toEqual({
      type: "data",
      event: "CLIENT_LIST",
      raw: clients,
    });
  });

  it('должен вернуть command для строки с ">"', () => {
    const line = ">BYTECOUNT_CLI:7,1843580,58892570";
    expect(classifyLog(line)).toEqual({
      type: "event",
      event: "BYTECOUNT_CLI",
      raw: line,
    });
  });

  it("должен вернуть event для ENV строки", () => {
    const line = ">CLIENT:ENV,untrusted_ip=192.168.1.1";
    expect(classifyLog(line)).toEqual({
      type: "event",
      event: "CLIENT_CONNECTED",
      raw: line,
    });
  });

  it("должен вернуть unknown если строка не подходит", () => {
    const line = "TITLE,OpenVPN 2.6.14";
    expect(classifyLog(line)).toEqual({ type: "unknown", raw: line });
  });

  it("parseClientStatus returns array with two clients", () => {
    const { raw } = classifyLog(clients);
    const parsed = parseClientStatus(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  });
});

// describe("classifyLine batch", () => {
//   it("должен вернуть массив строк как есть", () => {
//     const lines = [
//       "CLIENT_LIST,domodedovo,82.138.49.254:58098,10.8.0.3,,14320,21624,2025-09-18 20:49:38,1758217778,UNDEF,3,0,AES-256-GCM",
//       "CLIENT_LIST,leo-mob,85.198.104.111:16651,10.8.0.2,,520088,441075,2025-09-18 20:51:51,1758217911,UNDEF,6,1,AES-256-GCM",
//     ];
//
//     // expect(result).toEqual(lines);
//   });
// });
