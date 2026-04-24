import { Socket, createConnection } from "net";
import { setTimeout as delay } from "node:timers/promises";
import { EventEmitter } from "node:events";
import { Event } from "../Event.js";
import { createDefaultLogger } from "../utls.js";
import { OpenvpnResponseParser, ResponseType, ParsedResponse } from "./OpenvpnResponseParser.js";
import { HandshakeController, HandshakeState } from "./HandshakeController.js";

export interface Connect {
  id: string;
  host: string;
  port: number;
  timeout?: number;
  login?: string;
  password?: string;
}

export interface LoggerAdapter {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface Options {
  debug?: boolean;
  reconnect?: "always" | "never" | "manual";
  logger?: LoggerAdapter;
}

export class OpenvpnCore {
  private static readonly DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;

  public socket!: Socket;
  private readonly openvpnServer: Connect;
  private prefixLog = "openvpn";
  protected reconnectTime: number = 10000; // milliseconds
  protected emitter: EventEmitter;
  protected debug: boolean;
  protected reconnectRule: "always" | "never" | "manual";
  protected logger: LoggerAdapter;
  protected reconnectAbort: AbortController;

  private readyResolver!: () => void;
  private reconnectState: boolean = false;
  private connecting: boolean = false;

  // Новые компоненты парсинга
  private parser: OpenvpnResponseParser;
  private handshake: HandshakeController;

  // Буфер для неполных строк
  private parserBuffer: Buffer = Buffer.alloc(0);

  public ready: Promise<void>;

  constructor(openVPNServer: Connect, emitter: EventEmitter, opts: Options) {
    this.openvpnServer = openVPNServer;
    this.emitter = emitter;

    this.debug = opts.debug ?? false;
    this.reconnectRule = opts.reconnect ?? "always";
    this.logger = opts.logger ?? createDefaultLogger(this.debug);

    this.ready = new Promise((resolve) => {
      this.readyResolver = resolve;
    });

    this.reconnectAbort = new AbortController();

    // Инициализируем парсер и handshake контроллер
    this.parser = new OpenvpnResponseParser();
    this.handshake = new HandshakeController({
      onHelloReceived: () => this.onHelloReceived(),
      onHoldReceived: () => this.onHoldReceived(),
      onComplete: () => this.onHandshakeComplete(),
      onFailed: (error) => this.onHandshakeFailed(error),
      onSendCommand: (cmd) => this.writeSocket(cmd),
    });
  }

  public connect() {
    if (this.reconnectAbort) {
      this.reconnectAbort.abort();
    }
    this.reconnectAbort = new AbortController();

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
    return this.awaitHandshake();
  }

  private awaitHandshake(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let isSettled = false;
      const handshakeTimeoutMs =
          this.openvpnServer.timeout ??
          OpenvpnCore.DEFAULT_HANDSHAKE_TIMEOUT_MS;

      const handshakeTimeout = setTimeout(() => {
        const timeoutError = new Error(
            `Handshake timeout with ${this.openvpnServer.id} ` +
            `(${this.openvpnServer.host}:${this.openvpnServer.port}) ` +
            `- state: ${this.handshake.getState()}`,
        );

        if (this.reconnectRule !== "always") {
          rejectOnce(timeoutError);
          return;
        }

        this.logger.warn(timeoutError.message);
        this.connecting = false;
        this.socket.destroy();
        void this.reconnect()
            .then(resolveOnce)
            .catch((error: unknown) => {
              const reconnectError =
                  error instanceof Error ? error : new Error(String(error));
              rejectOnce(reconnectError);
            });
      }, handshakeTimeoutMs);

      const resolveOnce = () => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(handshakeTimeout);
        resolve();
      };

      const rejectOnce = (error: Error) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(handshakeTimeout);
        this.connecting = false;
        reject(error);
      };

      this.bindConnectionLifecycle(resolveOnce, rejectOnce);
    });
  }

  private bindConnectionLifecycle(
      resolveOnce: () => void,
      rejectOnce: (error: Error) => void,
  ) {
    this.socket.once("error", (error: Error) => {
      if (this.reconnectState) {
        this.connectionError(error);
        return;
      }
      rejectOnce(error);
    });

    this.socket.once("connect", () => {
      this.logger.info("Socket connected");
      this.socket.setKeepAlive(true);

      // Сбросить парсер и начать handshake
      this.parser.reset();
      this.handshake.reset();
      this.handshake.start();

      this.setHandlers(resolveOnce);
    });

    this.socket.once("close", () => {
      this.logger.error("Socket closed");
      this.connecting = false;
      if (this.reconnectRule === "always" && this.reconnectState) {
        this.reconnect();
      }
    });
  }

  private onHelloReceived() {
    this.logger.info(
        `Management hello received from ${this.openvpnServer.id}`,
    );
  }

  private onHoldReceived() {
    this.logger.debug(
        `Hold command received from ${this.openvpnServer.id}, sending hold release`,
    );
  }

  private onHandshakeComplete() {
    this.logger.info(
        `Handshake complete with ${this.openvpnServer.id}`,
    );
    this.reconnectState = true;
    this.connecting = false;
    this.readyResolver();
  }

  private onHandshakeFailed(error: Error) {
    this.logger.error(`Handshake failed: ${error.message}`);
    this.emitter.emit(Event.SOCKET_ERROR, {
      openvpnId: this.openvpnServer.id,
      err: error,
    });
  }

  public setHandlers(_onManagementHello?: () => void) {
    try {
      if (!this.socket) {
        throw new Error("Socket is undefined");
      }

      this.socket.on("data", (chunk: Buffer) => {
        this.processIncomingChunk(chunk);
      });
    } catch (e) {
      this.logger.error(e);
    }
  }

  private processIncomingChunk(chunk: Buffer) {
    this.parserBuffer = Buffer.concat([this.parserBuffer, chunk]);

    let newlineIndex = this.parserBuffer.indexOf(0x0a);
    while (newlineIndex !== -1) {
      const line = this.parserBuffer.toString("utf8", 0, newlineIndex);
      this.parserBuffer = this.parserBuffer.subarray(newlineIndex + 1);
      this.processIncomingLine(line);
      newlineIndex = this.parserBuffer.indexOf(0x0a);
    }
  }

  private processIncomingLine(line: string) {
    const parsed = this.parser.parseLine(line);
    if (!parsed || parsed.type === ResponseType.IGNORE) {
      return;
    }

    // Handlersake-специфичные события
    if (parsed.type === ResponseType.MANAGEMENT_HELLO) {
      this.handshake.handleManagementHello();
      return;
    }

    if (parsed.type === ResponseType.HOLD) {
      this.handshake.handleHold();
      return;
    }

    // Игнорируем другие события до завершения handshake
    if (!this.handshake.isComplete()) {
      this.logger.debug(
          `Ignoring response during handshake (state: ${this.handshake.getState()}): ${parsed.raw}`,
      );
      return;
    }

    // После handshake обрабатываем остальные ответы
    this.handleParsedResponse(parsed);
  }

  /**
   * Обработать распарсенный ответ от OpenVPN
   */
  private handleParsedResponse(parsed: ParsedResponse) {
    switch (parsed.type) {
      case ResponseType.COMMAND_RESPONSE:
        // SUCCESS: или ERROR:
        this.emitter.emit("data", parsed.content);
        break;

      case ResponseType.BLOCK_END:
        // Блочный ответ (статусы, листы клиентов и т.д.)
        if (Array.isArray(parsed.content) && parsed.content.length > 0) {
          this.emitter.emit("data", parsed.content.join("\r\n"));
        }
        break;

      case ResponseType.CLIENT_ENV_END:
        // CLIENT ENV блок
        if (Array.isArray(parsed.content) && parsed.content.length > 0) {
          this.emitter.emit("data", parsed.content.join("\r\n"));
        }
        break;

      case ResponseType.ASYNC_EVENT:
        // Async events: >INFO, >STATE, >LOG, >NOTIFY, >CLIENT
        this.emitter.emit("data", parsed.content);
        break;

      case ResponseType.BLOCK_LINE:
      case ResponseType.CLIENT_ENV_LINE:
        // Строки накапливаются в парсере, ничего не делаем
        break;

      default:
        // Остальное игнорируем
        break;
    }
  }

  public writeSocket(command: string) {
    try {
      if (!this.socket) {
        throw new Error("Socket is not defined");
      }

      this.socket.write(command, () => {
        this.logger.debug("write", command.replace(/\n$/, ""));
      });
    } catch (error: unknown) {
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

    this.reconnectAbort.abort();
    this.reconnectAbort = new AbortController();

    try {
      await delay(this.reconnectTime, {
        signal: this.reconnectAbort.signal,
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return;
      }
      throw error;
    }

    await this.connect();
  }

  private connectionError(err: Error) {
    this.logger.error(`[${this.prefixLog}] ${err}`);
    this.emitter.emit(Event.SOCKET_ERROR, {
      openvpnId: this.openvpnServer.id,
      err,
    });
  }

  /**
   * Завершает работу сокета
   */
  public endSocket(): Promise<void> {
    return new Promise((resolve) => {
      this.reconnectState = false;
      if (this.reconnectAbort) {
        this.reconnectAbort.abort();
      }
      if (this.socket) {
        return this.socket.end(() => {
          resolve();
        });
      }
      resolve();
    });
  }
}
