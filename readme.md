# OpenVPN API Wrapper

A lightweight OpenVPN API wrapper that communicates over **Telnet**.
This library has **zero dependencies** – it only uses built-in Node.js modules.
All methods are easily replaceable with equivalents from other runtimes such as **Deno** or **Bun**.

[Documention on russia](/readme.ru.md)
---

## Usage

```ts
// Import type helper
import { CustomEventType } from "openvpn-manager/event-responses.types";

// Create an optional event emitter
const event = new EventEmitter<CustomEventType>();

// Initialize a new OpenVPN API connection
const api = new OpenvpnApi(
  {
    id: "1",            // Server identifier (string, can be anything)
    host: "127.0.0.1",  // OpenVPN management interface host
    port: 7505,         // OpenVPN management interface port
    timeout: 5000,      // Connection timeout in ms (default: 5000)
  },
  {
    event,              // Optional: pass your own EventEmitter (typing will be lost)
    logger,             // Optional: custom logger (default: console)
    statusInterval,     // Optional: interval for updating status
  }
);

// Connect to the OpenVPN server
await api.connect();
```

---

## Events

To listen for server events, subscribe via the provided (or your own) `EventEmitter`:

```ts
event.on("client:connection", (data: Cl) => {
  console.log(data);
});
```

| Event               | Type               | Description                                              |
| ------------------- | ------------------ | -------------------------------------------------------- |
| `client:connection` | `ClientConnection` | Triggered when a client connects                         |
| `client:list`       | `ClientList`       | Provides the current list of connected clients           |
| `byte:count`        | `ByteCount`        | Provides client traffic statistics                       |

---

## Status

Retrieves a list of connected clients, their IP addresses, and the date & time of their connection.
For more details, see the official OpenVPN documentation:
[OpenVPN Management Interface Documentation](https://openvpn.net/community-resources/management-interface/)

---