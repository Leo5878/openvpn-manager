import { Socket, createConnection } from "net";
import { setTimeout as delay } from "node:timers/promises";
import { EventEmitter } from "node:events";
import { Event } from "./Event.js";
import { createDefaultLogger } from "./utls.js";

export interface Connect {
  id: string;
  host: string;
  port: number;
  timeout?: number;
  login?: string;
  password?: string;
}

export interface LoggerAdapter {
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export interface Options {
  debug?: boolean;
  reconnect?: "always" | "never" | "manual";
  logger?: LoggerAdapter;
}

export class OpenvpnCore {
  public socket!: Socket;
  private readonly openvpnServer: Connect;
  private prefixLog = "openvpn";
  protected reconnectTime: number = 10000; // milliseconds. 10 second
  protected emitter: EventEmitter;
  protected debug: boolean;
  protected reconnectRule: "always" | "never" | "manual";
  protected logger: LoggerAdapter;
  protected reconnectAbort: AbortController;

  private readyResolver!: () => void;
  private reconnectState: boolean = false;
  private connecting: boolean = false;

  public ready: Promise<void>;

  constructor(openVPNServer: Connect, emitter: EventEmitter, opts: Options) {
    this.openvpnServer = openVPNServer;
    this.emitter = emitter;

    this.debug = opts.debug ?? false;
    this.reconnectRule = opts.reconnect ?? "always";
    this.logger = opts.logger ?? createDefaultLogger();

    this.ready = new Promise((resolve) => {
      this.readyResolver = resolve;
    });

    this.reconnectAbort = new AbortController()
  }

  public connect() {
    if (this.reconnectAbort) {
      this.reconnectAbort.abort();
      // this.reconnectAbort = undefined;
    }

    if (this.connecting) {
      this.logger.warn(
        "Connection attempt skipped: already connecting or connected",
      );
      return Promise.resolve();
    }

    this.socket = createConnection({
      host: this.openvpnServer.host,
      port: this.openvpnServer.port,
      timeout: this.openvpnServer.timeout,
    });

    this.connecting = true;

    return new Promise<void>(async (resolve, reject) => {
      this.socket.once("error", (error: Error) => {
        if (this.reconnectState) return;
        return reject(error);
      });

      this.socket.once("connect", () => {
        this.logger.info("Socket connected");

        this.socket.once("data", (stream: string) => {
          const managementHello = stream.toString();

          // When connecting, OpenVPN should send a welcome message similar to:
          // ">INFO:OpenVPN Management Interface".
          // Only after receiving this message will OpenVPN respond to further commands.
          if (managementHello.includes(">INFO:OpenVPN Management Interface")) {
            this.logger.info(
              `Connected to OpenVPN Management ${this.openvpnServer.id}`,
            );

            this.reconnectState = true;
            // this.emitter.emit(Event.MANAGER_READY);

            clearInterval(managementHelloTimeout);
            this.setHandlers();
            this.readyResolver();
            return resolve();
          }
        });
      });

      const managementHelloTimeout = setInterval(() => {
        this.logger.warn(
          `Server ${JSON.stringify({ id: this.openvpnServer.id, addresses: this.openvpnServer.host + ":" + this.openvpnServer.port })} is busy with another connection`,
        );
        // TODO Вынести таймер в .env
      }, 5000);

      this.socket.once("close", () => {
        this.logger.error("Socket closed");
        this.connecting = false;

        if (this.reconnectRule === "always" && this.reconnectState) {
          this.reconnect();
        }

        clearInterval(managementHelloTimeout);
      });
    });
  }

  public setHandlers() {
    try {
      if (!this.socket) {
        throw new Error("Socket is undefined");
      }

      this.socket.once("connect", () => {
        this.socket.setKeepAlive(true);
      });

      let buffer = "";
      let blockLines: string[] = [];
      let clientEnvLines: string[] = [];

      this.socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // последняя незавершённая строка остаётся в буфере

        for (const line of lines) {
          const normalized = line.replace(/\r$/, "");
          const trimmed = normalized.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith("SUCCESS:") || trimmed.startsWith("ERROR:")) {
            this.emitter.emit("data", trimmed);
            continue;
          }

          if (trimmed.startsWith(">CLIENT:")) {
            clientEnvLines.push(trimmed);
            if (trimmed.startsWith(">CLIENT:ENV,END")) {
              if (clientEnvLines.length > 0) {
                this.emitter.emit("data", clientEnvLines.join("\r\n"));
              }
              clientEnvLines = [];
            }
            continue;
          }

          if (trimmed === "END") {
            if (blockLines.length > 0) {
              this.emitter.emit("data", blockLines.join("\r\n"));
            }
            blockLines = [];
            continue;
          }

          if (trimmed.startsWith(">")) {
            this.emitter.emit("data", trimmed);
            continue;
          }

          // Блочные ответы собираем построчно до END
          blockLines.push(trimmed);
        }
      });
    } catch (e) {
      this.logger.error(e);
    }
  }

  public writeSocket(command: string) {
    try {
      if (!this.socket) {
        throw new Error("Socket is not defined");
      }

      this.socket.write(command, () => {
        this.logger.debug("debug write", command);
      });
    } catch (error: any) {
      this.logger.error(`${error}`);
    }
  }

  public async reconnect() {
    const { host, port, id } = this.openvpnServer;
    const timeUnit =
      this.reconnectTime >= 1000 ? `${this.reconnectTime / 1000}s` : "ms";

    this.logger.info(
      `Reconnecting to server ${id} ${host}:${port} in ${timeUnit}`,
    );

    // this.reconnectAbort = new AbortController();
    this.reconnectAbort.abort();

    try {
      await delay(this.reconnectTime, {
        signal: this.reconnectAbort.signal,
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return;
      }
      throw error;
    } /*finally {
      this.reconnectAbort = undefined;
    }*/

    await this.connect();
  }

  /**
   * Если не удалось установить соединение, то можно вызывать openvpn.reconnect();
   * @private
   * @param err
   */
  private connectionError(err: Error) {
    this.logger.error(`[${this.prefixLog}] ${err}`);

    // TODO Документировать
    this.emitter.emit(Event.SOCKET_ERROR, {
      openvpnId: this.openvpnServer.id,
      err,
    });
  }

  /**
   * **Завершает работу сокета**
   *
   * Не рекомендуется к использованию, если вы не знайте, что это и зачем вам.
   * Чтобы полностью закрыть соединение, используйте метод `.shutdown`
   */
  public endSocket(): Promise<void> {
    return new Promise((resolve) => {
      this.reconnectState = false;
      if (this.reconnectAbort) {
        this.reconnectAbort.abort();
        // this.reconnectAbort = undefined;
      }
      if (this.socket) {
        return this.socket.end(() => {
          resolve();
        });
      }
    });
  }
}
