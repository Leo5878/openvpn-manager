export type Signal = "SIGHUP" | "SIGTERM" | "SIGUSR1" | "SIGUSR2" | "SIGINT";
export type AuthRetryMode = "none" | "nointeract" | "interact";
export type LogLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface LoadStatsInfo {
  /** Number of currently connected clients */
  nClients: number;
  /** Total bytes in */
  bytesIn: number;
  /** Total bytes out */
  bytesOut: number;
  raw: string;
}

export interface CommandResult {
  success: boolean;
  raw: string;
}

export interface VersionInfo {
  managementVersion: string;
  openvpnVersion: string;
  raw: string;
}

export interface PidInfo {
  pid: number;
  raw: string;
}

export interface RsaSignResult {
  signature: string;
  raw: string;
}
