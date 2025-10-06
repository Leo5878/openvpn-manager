import { Event, InternalEvent } from "./Event";

export type CustomEventType = {
  [K in keyof EventMap]: [EventMap[K]];
};

interface Base {
  id: string;
}

/** Platform reported by the OpenVPN client. */
export type OpenVPNPlatform =
  | "ios"
  | "android"
  | "win"
  | "mac"
  | "linux"
  | "chromeos"
  | "ovpncli"
  | "openvpnserv2"
  | "unknown"
  | string; // fallback for unexpected future values

/**
 * Types on fields generated and fixed by ChatGPT
 */
/**
 * Represents information about a connected OpenVPN client.
 */
export interface Cl {
  /** Server identifier provided by the client during library initialization. Internal value*/
  id: string;

  /** Common Name (CN) from the client's certificate. */
  commonName: string;

  /** Real (public) IP address and port of the connected client. */
  realAddress: string;

  /** Virtual IPv4 address assigned to the client inside the VPN. */
  virtualAddress: string;

  /** Virtual IPv6 address assigned to the client (if applicable). */
  virtualIPv6Address: string;

  /** Total number of bytes received from the client. */
  bytesReceived: number;

  /** Total number of bytes sent to the client. */
  bytesSent: number;

  /** Connection start time in human-readable format (e.g., ISO string). */
  connectedSince: string;

  /** Connection start time in Unix timestamp (seconds since epoch). */
  connectedSinceEpoch: number;

  /** Username used for authentication (if any). */
  username: string;

  /** Unique client ID assigned by the OpenVPN server. */
  clientID: number;

  /** Peer ID assigned to the client within the current session. */
  peerID: number;

  /** Cipher algorithm used on the data channel (e.g., "AES-256-GCM"). */
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

/**
 * Types on fields generated and fixed by ChatGPT
 */
/**
 * Represents server-side initialization data sent by an OpenVPN or similar service.
 */
export interface ConnectionClient extends Base {
  /** Server identifier provided by the client during library initialization. Internal value*/
  id: string;

/**
 * Current connection status of the client.
 * Examples: "CONNECTED", "DISCONNECTED", "RECONNECTING".
 */
  connection: string;
  
  /** Number of active clients connected to this server. */
  n_clients: string;

  /** Current timestamp in Unix time (seconds since epoch). */
  timeUnix: number;

  /** Current timestamp in human-readable ISO format (UTC). */
  timeAscii: Date;

  /** Netmask of the address pool assigned to VPN clients. */
  ifconfigPollNetmask: string;

  /** IP address from the pool assigned to the current client. */
  ifconfigPoolRemoteIp: string;

  /** Trusted port number from which the client connection was accepted. */
  trustedPort: number;

  /** Trusted IP address of the client as seen by the server. */
  trustedIp: string;

  /** Common Name (CN) extracted from the client's certificate. */
  commonName: string;

  /** OpenVPN Initialization Variables — data provided by the client during handshake. */
  IV: {
    /** Authentication method (e.g., "webauth,crtext"). */
    sso: string;

    /** GUI version of the OpenVPN client application. */
    guiVer: string;

    /** Compression stub version (0 if compression is disabled). */
    compStub: number;

    /** Secondary compression stub version (0 if compression is disabled). */
    compStubV2: number;

    /** LZO compression stub version (0 if compression is disabled). */
    lzoStub: number;

    /** Internal protocol or port number reported by the client. */
    proto: number;

    /** Supported cipher list by the client. */
    ciphers: string[];

    /** Network Crypto Provider version. */
    ncp: string;

    /** Maximum MTU value reported by the client. */
    mtu: string;

    /** TCP no-delay flag (1 = enabled). */
    tcpnl: string;

    /** Platform name (e.g., "ios", "android", "win"). */
    plat: OpenVPNPlatform;

    /** Version of the OpenVPN core library. */
    ver: string;
  };

  /** Untrusted port number before TLS verification (usually same as trustedPort). */
  untrustedPort: number;

  /** Untrusted IP address before TLS verification (usually same as trustedIp). */
  untrustedIp: string;

  /** TLS identifier type for the first participant (usually "CN"). */
  tlsId0: string;

  /** Common Name of the first TLS participant (the client). */
  x509_0_cn: string;

  /** TLS identifier type for the second participant (usually "CN"). */
  tlsId1: string;

  /** Common Name of the second TLS participant (the server). */
  x509_1_cn: string;

  /** Client's remote port (source port used for the connection). */
  remotePort1: number;

  /** Local server port where the connection was accepted. */
  localPort1: number;

  /** Connection protocol ("udp" or "tcp"). */
  proto1: string;

  /** Process ID of the OpenVPN daemon handling this session. */
  daemonPid: string;

  /** Daemon start time in Unix time. */
  daemonStartTime: number;

  /** Indicates if log redirection is enabled ("1" = enabled). */
  daemonLogRedirect: string;

  /** Daemon instance identifier (e.g., "0"). */
  daemon: string;

  /** Verbosity level of the OpenVPN logs. */
  verb: number;

  /** Name of the OpenVPN configuration file used by this instance. */
  config: string;

  /** Local VPN IP address of the server (e.g., 10.x.x.1). */
  ifconfigLocal: string;

  /** Subnet mask of the VPN interface. */
  ifconfigNetmask: string;

  /** Script context (e.g., "init" means during initialization). */
  scriptContext: string;

  /** MTU of the TUN interface. */
  tunMtu: number;

  /** Name of the virtual interface (e.g., "tun0"). */
  dev: string;

  /** Type of the virtual interface ("tun" or "tap"). */
  devType: string;
}

export interface ByteCount extends Base {
  /** Unique client ID assigned by the OpenVPN server for this session. */
  clientID: number;

  /** Total number of bytes received from the client (traffic incoming to server). */
  bytesReceived: number;

  /** Total number of bytes sent to the client (traffic outgoing from server). */
  bytesSent: number;
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
