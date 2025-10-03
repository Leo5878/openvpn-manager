import { Event, InternalEvent } from "./Event";

export type CustomEventType = {
  [K in keyof EventMap]: [EventMap[K]];
};

interface Base {
  id: string;
}

export interface Cl extends Base {
  commonName: string;
  realAddress: string;
  virtualAddress: string;
  virtualIPv6Address: string;
  bytesReceived: number;
  bytesSent: number;
  connectedSince: string;
  connectedSinceEpoch: number;
  username: string;
  clientID: number;
  peerID: number;
  dataChannelCipher: string;
}

export interface RawConnectionClient {
  connection: string;
  n_clients: string;
  time_unix: string;
  time_ascii: string;
  ifconfig_pool_netmask: string;
  ifconfig_pool_remote_ip: string;
  trusted_port: string;
  trusted_ip: string;
  common_name: string;
  IV_SSO: string;
  IV_GUI_VER: string;
  IV_AUTO_SESS: string;
  IV_CIPHERS: string;
  IV_MTU: string;
  IV_PROTO: string;
  IV_TCPNL: string;
  IV_NCP: string;
  IV_PLAT: string;
  IV_VER: string;
  IV_COMP_STUBv2: string;
  IV_COMP_STUB: string;
  IV_LZO_STUB: string;
  untrusted_port: string;
  untrusted_ip: string;
  tls_serial_hex_0: string;
  tls_serial_0: string;
  tls_digest_sha256_0: string;
  tls_digest_0: string;
  tls_id_0: string;
  X509_0_CN: string;
  tls_serial_hex_1: string;
  tls_serial_1: string;
  tls_digest_sha256_1: string;
  tls_digest_1: string;
  tls_id_1: string;
  X509_1_CN: string;
  remote_port_1: string;
  local_port_1: string;
  proto_1: string;
  daemon_pid: string;
  daemon_start_time: string;
  daemon_log_redirect: string;
  daemon: string;
  verb: string;
  config: string;
  ifconfig_local: string;
  ifconfig_netmask: string;
  script_context: string;
  tun_mtu: string;
  dev: string;
  dev_type: string;
  redirect_gateway: string;
}

export interface ConnectionClient extends Base {
  connection: string;
  n_clients: string;
  timeUnix: number;
  timeAscii: Date;
  ifconfigPollNetmask: string;
  ifconfigPoolRemoteIp: string;
  trustedPort: number;
  trustedIp: string;
  commonName: string;
  IV: {
    sso: string;
    guiVer: string;
    compStub: number;
    compStubV2: number;
    lzoStub: number;
    proto: number;
    ciphers: string[];
    ncp: string;
    mtu: string;
    tcpnl: string;
    plat: string;
    ver: string;
  };
  untrustedPort: number;
  untrustedIp: string;
  tlsId0: string;
  x509_0_cn: string;
  tlsId1: string;
  x509_1_cn: string;
  remotePort1: number;
  localPort1: number;
  proto1: "tcp" | "udp";
  daemonPid: string;
  daemonStartTime: number;
  daemonLogRedirect: string;
  daemon: string;
  verb: number;
  config: string;
  ifconfigLocal: string;
  ifconfigNetmask: string;
  scriptContext: string;
  tunMtu: number;
  dev: string;
  devType: string;
}

export interface ByteCount extends Base {
  clientID: number;
  bytesReceived: number; // from client
  bytesSent: number; // to client
}

export interface EventMap {
  // Event where client connection to openvpn server
  [Event.CLIENT_CONNECTION]: ConnectionClient;
  [Event.BYTECOUNT_CLI]: ByteCount;
  // List clients connected to openvpn server
  [Event.CLIENT_LIST]: Cl[];
  [Event.ROUTING_TABLE]: void;
  [Event.SERVER_TIME]: void;
  [Event.CLIENT_DISCONNECTION]: string[];
  [Event.SOCKET_ERROR]: {
    id: number;
    err: unknown;
  };
}

export interface InternalEventMap extends EventMap {
  [InternalEvent.CLIENT_END]: void;
}
