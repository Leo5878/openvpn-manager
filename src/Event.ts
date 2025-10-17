// export enum Event {
//   // socket
//   SOCKET_SHUTDOWN = "socket_shutdown",
//   SOCKET_ERROR = "socket_error",
//   SOCKET_CLOSE = "socket_close",
//   SOCKET_TIMEOUT = "socket_timeout",
//   // OpenVPN responses
//   BYTECOUNT_CLI = "cli:bytecount",
//   CLIENT_LIST = "client:list",
//   CLIENT_END = "client:end",
//   CLIENT_CONNECTION = "client:connection",
//   ROUTING_TABLE = "routing:table",
//   SERVER_TIME = "server:time",
// }

export const Event = {
  // socket
  SOCKET_ERROR: "socket:error",
  // SOCKET_SHUTDOWN: "socket_shutdown",
  // SOCKET_CLOSE: "socket_close",
  // SOCKET_TIMEOUT: "socket_timeout",
  MANAGER_READY: "manager:ready",
  // OpenVPN responses
  CLIENT_CONNECTION: "client:connection",
  BYTECOUNT_CLI: "bytecount:cli",
  CLIENT_LIST: "client:list",
  ROUTING_TABLE: "routing:table",
  SERVER_TIME: "server:time",
  CLIENT_DISCONNECTION: "client:disconnect",
} as const;

export const InternalEvent = {
  CLIENT_END: "client:end",
  // SOCKET_ERROR: "socket:error",
  // SOCKET_SHUTDOWN: "socket_shutdown",
  // SOCKET_CLOSE: "socket_close",
  // SOCKET_TIMEOUT: "socket_timeout",
} as const;
