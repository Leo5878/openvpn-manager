# OpenVPN Manager Wrapper

OpenVPN Manager Wrapper is a lightweight TypeScript library with no dependencies, providing a convenient interface for interacting with the OpenVPN Management Interface.
It allows you to connect to the server, manage clients, send typed commands, and receive real-time events.

The library relies only on the standard Node.js API.
You can easily adapt the methods for other runtimes (Deno, Bun).
The project is written in TypeScript, giving you static typing and IDE autocompletion.

For seamless integration with NestJS, check out the wrapper:\
👉 [openvpn-manager-nestjs](https://github.com/Leo5878/openvpn-manager-nestjs)

[Documentation in Russian](/README.ru.md)

## Features

* Client connection and disconnection events
* Retrieve the full list of active clients
* Monitor client traffic
* Typed async commands with promise-based responses
* Error handling via `OpenvpnCommandError`

# Quick Start

## Install
### npm
```bash
npm install @ad0nis/openvpn-manager
```

### yarn
```bash
yarn add @ad0nis/openvpn-manager
```

---

Create an instance of `OpenvpnManager` and connect to the server.
To learn how to configure the OpenVPN Manager, see [this guide](./docs/Openvpn-manager.md) or the [official OpenVPN documentation](https://openvpn.net/community-docs/community-articles/openvpn-2-6-manual.html#management-interface-options-177179).

```ts
const api = new OpenvpnManager({
  id: "srv1",         // Server identifier (any string)
  host: "127.0.0.1",  // Address of the OpenVPN Manager
  port: 7505,         // Port of the OpenVPN Manager
  timeout: 5000,      // Connection timeout in ms (default 5000)
});

await api.connect();
```

At this point, the connection to OpenVPN is established.
To receive events, subscribe to the desired ones:

```ts
api.on("client:connection", (client: ConnectionClient) => {
  // Handle connected client
});

api.once("client:list", (clients: Cl) => {
  // Handle list of clients. Triggered once
});
```

A full list of available events can be found in the [Events](#events) section.

### Constructor Options

Additional parameters available when creating an instance of `OpenvpnManager`:

* `event` — custom EventEmitter for event handling (by default, an internal emitter is created).
* `logger` — logger for log management (by default, `console` is used).
* `reconnect` — controls the behavior when the connection is lost. Defaults to `always`, which makes the client automatically reconnect. `never` disables automatic reconnection. Possible values: `always`, `never`.

```ts
import { CustomEventType } from "openvpn-manager/event-responses.types";

const emitter = new EventEmitter<CustomEventType>();

const api = new OpenvpnManager(
  {
    id: "1",
    host: "127.0.0.1",
    port: 7505,
    timeout: 5000,
  },
  {
    event: emitter,   // Custom event emitter
    logger: console,  // Default logger is console, but you can pass your own
  }
);
```

## Events

All events and interfaces can be found in the [types file](https://github.com/Leo5878/openvpn-manager/blob/main/src/event-responses.types.ts)

| Event                     | Type                       | Description                                                                                                                                                   |
|---------------------------|----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `client:connection`       | `ConnectionEvent`          | Triggered when a client has authenticated and the session is being created. The tunnel is not yet active                                                      |
| `client:established`      | `ConnectionEvent`          | Triggered when a client has authenticated. The tunnel is not yet active — use clientAuth() to approve or clientDeny() to reject the connection at this point. |
| `client:list`             | `Cl[]`                     | List of connected clients                                                                                                                                     |
| `bytecount:cli`           | `ByteCount`                | Client traffic information                                                                                                                                    |
| `client:disconnect`       | `ClientDisconnect`         | Returns an array of CommonName values (will be expanded)                                                                                                      |
| `client:disconnect:event` | `ClientEnvDisconnectEvent` | Raw disconnect payload from `>CLIENT:DISCONNECT,...` management event                                                                                         |
| `socket:error`            | `SocketError`              | Socket error during connection                                                                                                                                |

### client:list

The `client:list` event returns information about connected clients:

* CN (Client Name)
* Real address (IP:Port)
* Virtual IP address
* Incoming and outgoing traffic volume
* Connection date and time

For more details, see the [OpenVPN Management Interface Documentation](https://openvpn.net/community-resources/management-interface/).

## Commands

`OpenvpnManager` provides typed async wrappers for the most common OpenVPN Management Interface commands.
Each command returns a promise and throws `OpenvpnCommandError` if OpenVPN responds with an error.

### Client Management

```ts
// Disconnect a client by Common Name
await api.killClientByCn("client-cn");

// Disconnect a client by real address (ip:port)
await api.killClientByAddress("1.2.3.4:12345");

// Disconnect a client by numeric client ID (from client:list)
await api.clientKill(42);
await api.clientKill(42, "restart");

// Approve client authentication (when using --auth-user-pass-verify)
await api.clientAuth(clientId, keyId);
await api.clientAuthNt(clientId, keyId);

// Deny client authentication
await api.clientDeny(clientId, keyId, "Access denied");
await api.clientDeny(clientId, keyId, "Access denied", "Reason shown to client");
```

### Server Info

```ts
// Get OpenVPN and Management Interface version
const version = await api.getVersion();
console.log(version.openvpnVersion);      // "OpenVPN 2.6.x ..."
console.log(version.managementVersion);   // "5"

// Get PID of the OpenVPN process
const { pid } = await api.getPid();
console.log(pid); // 12345

// Get aggregated server stats (lightweight alternative to status)
const stats = await api.getLoadStats();
console.log(stats.nClients);  // number of connected clients
console.log(stats.bytesIn);
console.log(stats.bytesOut);

// Request current client list as a promise
const clients = await api.requestStatus();
```

### Traffic Monitoring

```ts
// Set BYTECOUNT_CLI event interval in seconds (0 to disable)
await api.setBytecount(5);
```

### Logging

```ts
await api.enableLog();
await api.disableLog();

const lines = await api.getLog("all");
const last10 = await api.getLog(10);

await api.setVerbosity(4);
await api.setMute(10);
```

### Signals

```ts
// Reload config and reconnect all clients
await api.sendSignal("SIGHUP");

// Soft restart (without closing the tun interface)
await api.sendSignal("SIGUSR1");

// Print statistics to log
await api.sendSignal("SIGUSR2");

// Terminate the process
await api.sendSignal("SIGTERM");
```

### Authentication

```ts
// Send credentials in response to >PASSWORD:
await api.sendAuth("Auth", "username", "password");

// Set behavior on auth failure
await api.setAuthRetry("nointeract");
```

### Hold

Hold mode makes OpenVPN pause before (re)connecting and wait for `holdRelease`.
This is useful when you need to set up credentials or ensure your app is ready before the tunnel starts.

```ts
await api.holdOn();

// ... do something, e.g. ask user for credentials ...

await api.holdRelease();
```

### Error Handling

If OpenVPN responds with an error, the command throws `OpenvpnCommandError`:

```ts
import { OpenvpnCommandError } from "@ad0nis/openvpn-manager";

try {
  await api.killClientByCn("nonexistent");
} catch (e) {
  if (e instanceof OpenvpnCommandError) {
    console.error(e.message); // "common name 'nonexistent' not found"
    console.error(e.raw);     // raw response from OpenVPN
  }
}
```

### Low-level Access

If you need to send a command not covered by the typed wrappers, use `writeSocket` directly:

```ts
api.writeSocket("custom-command\r\n"); // \r\n is required
```

> [!NOTE]
> `writeSocket` is a low-level method — it performs no processing and does not integrate with the command queue. Responses must be handled via the `data` event.

```ts
api.on("data", (data: string) => {
  // Raw data from OpenVPN
});
```
