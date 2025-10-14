# OpenVPN Manager Wrapper

OpenVPN Manager Wrapper is a lightweight TypeScript library with no dependencies, providing a convenient interface for interacting with the OpenVPN Management Interface.
It allows you to connect to the server, manage clients, and receive real-time events.

The library relies only on the standard Node.js API.
You can easily adapt the methods for other runtimes (Deno, Bun).
The project is written in TypeScript, giving you static typing and IDE autocompletion.

[Documentation in Russian](/README.ru.md)

# Features

* Client connection and disconnection events
* Retrieve the full list of active clients
* Monitor client traffic
* Send commands to the OpenVPN server

# Quick Start

Create an instance of `OpenvpnManager` and connect to the server.
To learn how to configure the OpenVPN Manager, see [this guide](./docs/Openvpn-manager.md) or the [official OpenVPN documentation](https://openvpn.net/community-docs/community-articles/openvpn-2-6-manual.html#management-interface-options-177179).

```ts
// Initialize connection to the OpenVPN API
const api = new OpenvpnManager({
  id: "srv1",         // Server identifier (any string)
  host: "127.0.0.1",  // Address of the OpenVPN Manager
  port: 7505,         // Port of the OpenVPN Manager
  timeout: 5000,      // Connection timeout in ms (default 5000)
});

// Connect
await api.connect();
```

At this point, the connection to OpenVPN is established.
To receive events, subscribe to the desired ones:

```ts
// Connected client
api.on("client:connection", (client: ConnectionClient) => {
  // Handle connected client
});
    
// Get client list
api.once("client:list", (clients: Cl) => {
  // Handle list of clients. Triggered once
});
```

A full list of available events can be found in the [Events](#events) section.

# Constructor Options

Additional parameters available when creating an instance of `OpenvpnManager`:

* `event` — custom EventEmitter for event handling (by default, an internal emitter is created).
* `logger` — logger for log management (by default, `console` is used).

```ts
// Import helper for typing
import { CustomEventType } from "openvpn-manager/event-responses.types";

// Create emitter
const emitter = new EventEmitter<CustomEventType>();

const api = new OpenvpnManager(
  {
    id: "1",
    host: "127.0.0.1",
    port: 7505,
    timeout: 5000,
  },
  {
    event: emitter, 	// Custom event emitter
    logger: console, 	// Default logger is console, but you can pass your own
  }
);
```

# Events

All events and interfaces can be found in the [types file](https://github.com/Leo5878/openvpn-manager/blob/main/src/event-responses.types.ts)

| Event               | Type               | Description                                              |
|---------------------|--------------------|----------------------------------------------------------|
| `client:connection` | `ClientConnection` | Triggered when a client connects                         |
| `client:list`       | `Cl`               | List of connected clients                                |
| `byte:count`        | `ByteCount`        | Client traffic information                               |
| `client:disconnect` | `ClientDisconnect` | Returns an array of CommonName values (will be expanded) |
| `socket:error`      | `SocketError`      | Socket error during connection                           |

## Status

The **status** method returns information about connected clients:

* CN (Client Name)
* Real address (IP:Port)
* Virtual IP address
* Incoming and outgoing traffic volume
* Connection date and time

For more details, see the [OpenVPN Management Interface Documentation](https://openvpn.net/community-resources/management-interface/)

## Sending Commands

The `writeSocket` method allows sending raw commands directly to the OpenVPN Manager socket.
This method performs no extra processing — it simply writes the provided string to the socket.
Each command must end with `\r\n`.

Example:

```ts
this.writeSocket("status 2\r\n"); // <- \r\n is required at the end of each command
```

To handle responses, subscribe to the global `data` event.
It is global because it reports **all** messages received from OpenVPN.

> [!NOTE]
> This is a *low-level* method — it doesn’t perform any additional processing, only writes to the socket.

Example:

```ts
api.on("data", (data: string) => {
  // Handle connected client
});
```
