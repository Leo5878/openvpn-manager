import { Socket, createConnection } from "net";
import { EventEmitter } from "node:events";
import { Event } from "./Event";
import { createDefaultLogger } from "./utls";

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
  public socket: Socket;
  private openvpnServer: Connect;
  private prefixLog = "openvpn";
  protected reconnectTime: number = 10 * 1000; // milliseconds. 10 second
  protected emitter: EventEmitter;
  protected reconnectTimeout!: NodeJS.Timeout;
  protected debug: boolean;
  protected reconnectRule: "always" | "never" | "manual";
  protected logger: LoggerAdapter;

  private readyResolver!: () => void;
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
  }

  public connect() {
    this.socket = createConnection({
      host: this.openvpnServer.host,
      port: this.openvpnServer.port,
      timeout: this.openvpnServer.timeout,
    });

    return new Promise<void>((resolve, reject) => {
      this.socket.once("error", (error: Error) => {
        return reject(error);
      });

      this.socket.once("connect", () => {
        this.reconnectTimeout = setTimeout(
          () => this.reconnect(),
          this.reconnectTime,
        );

        this.setHandlers();

        this.socket.once("data", (stream: string) => {
          const managementHello = stream.toString();

          // When connecting, OpenVPN should send a welcome message similar to:
          // ">INFO:OpenVPN Management Interface".
          // Only after receiving this message will OpenVPN respond to further commands.
          if (managementHello.includes(">INFO:OpenVPN Management Interface")) {
            this.logger.info(
              `Connected to OpenVPN Management ${this.openvpnServer.id}`,
            );
            clearTimeout(managementHelloTimeout);

            this.readyResolver();
            return resolve();
          }
        });
      });

      const managementHelloTimeout = setInterval(() => {
        this.logger.error(
          `The connection to the server ${JSON.stringify({ id: this.openvpnServer.id, addresses: this.openvpnServer.host + ":" + this.openvpnServer.port })} is busy`,
        );
        // TODO Вынести таймер в .env
      }, 5000);
    });
  }

  public setHandlers() {
    try {
      if (!this.socket) {
        throw new Error("Socket is not defined");
      }

      this.socket.once("connect", () => {
        this.socket.setKeepAlive(true);
      });

      let buffer = "";
      const regex = /\r?\nEND\r?\n/;

      this.socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();

        let match: RegExpExecArray | null;
        while ((match = regex.exec(buffer)) !== null) {
          const idx = match.index;
          const block = buffer.slice(0, idx); // всё до END
          buffer = buffer.slice(idx + match[0].length); // остаток после END

          this.emitter.emit("data", block);
          regex.lastIndex = 0; // сбрасываем, иначе regex.exec продолжит с позиции в старом buffer
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
      this.logger.error(`${this.prefixLog} writeSocket >> error = ${error}`);
    }
  }

  public reconnect() {
    clearTimeout(this.reconnectTimeout); // clear current call to reconnect (to avoid stacking up)
    this.reconnectTimeout = setTimeout(
      () => this.reconnect(),
      this.reconnectTime,
    );
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
      if (this.socket) {
        this.socket.end(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
