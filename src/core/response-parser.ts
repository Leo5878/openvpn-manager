/**
 * Парсер OpenVPN management interface ответов
 * Отвечает только за разбор строк и накопление блочных ответов
 */

export enum ResponseType {
  COMMAND_RESPONSE = "COMMAND_RESPONSE", // SUCCESS/ERROR
  MANAGEMENT_HELLO = "MANAGEMENT_HELLO",
  HOLD = "HOLD",
  ASYNC_EVENT = "ASYNC_EVENT", // >INFO, >STATE, >CLIENT, >LOG, >NOTIFY
  BLOCK_START = "BLOCK_START",
  BLOCK_LINE = "BLOCK_LINE",
  BLOCK_END = "BLOCK_END",
  CLIENT_ENV_LINE = "CLIENT_ENV_LINE",
  CLIENT_ENV_END = "CLIENT_ENV_END",
  IGNORE = "IGNORE",
}

export interface ParsedResponse {
  type: ResponseType;
  raw: string;
  content?: string | string[];
}

export class ResponseParser {
  private blockBuffer: string[] = [];
  private clientEnvBuffer: string[] = [];

  constructor(
    private managementHelloMarker = ">INFO:OpenVPN Management Interface",
  ) {}

  /**
   * Парсит одну строку и возвращает тип ответа и содержимое.
   * Работает со состоянием для накопления блочных ответов
   */
  parseLine(line: string): ParsedResponse | null {
    const normalized = line.replace(/\r$/, "").trim();

    // Пустые строки игнорируем
    if (!normalized) {
      return { type: ResponseType.IGNORE, raw: line };
    }

    // Management hello от OpenVPN (первое сообщение при подключении)
    if (
      normalized.includes(this.managementHelloMarker) &&
      this.blockBuffer.length === 0
    ) {
      return {
        type: ResponseType.MANAGEMENT_HELLO,
        raw: line,
        content: normalized,
      };
    }

    // HOLD-событие от OpenVPN management
    if (normalized.startsWith(">HOLD:")) {
      return {
        type: ResponseType.HOLD,
        raw: line,
        content: normalized,
      };
    }

    // Ответы на команды (SUCCESS/ERROR)
    if (normalized.startsWith("SUCCESS:") || normalized.startsWith("ERROR:")) {
      // Если у нас собран блок, нужно его вернуть перед командным ответом
      if (this.blockBuffer.length > 0) {
        const bufferedBlock: ParsedResponse = {
          type: ResponseType.BLOCK_END,
          raw: "END",
          content: this.blockBuffer,
        };
        this.blockBuffer = [];
        // Вернём блок, а команду обработаем в следующем вызове
        // Или переделать логику парсинга
      }
      return {
        type: ResponseType.COMMAND_RESPONSE,
        raw: line,
        content: normalized,
      };
    }

    // CLIENT ENV (может быть многострочным)
    if (normalized.startsWith(">CLIENT:")) {
      this.clientEnvBuffer.push(normalized);

      if (normalized.startsWith(">CLIENT:ENV,END")) {
        const result: ParsedResponse = {
          type: ResponseType.CLIENT_ENV_END,
          raw: line,
          content: this.clientEnvBuffer,
        };
        this.clientEnvBuffer = [];
        return result;
      }

      return {
        type: ResponseType.CLIENT_ENV_LINE,
        raw: line,
        content: normalized,
      };
    }

    // Маркер конца блочного ответа (statuses, info blocks)
    if (normalized === "END") {
      if (this.blockBuffer.length === 0) {
        return { type: ResponseType.IGNORE, raw: line };
      }

      const result: ParsedResponse = {
        type: ResponseType.BLOCK_END,
        raw: line,
        content: this.blockBuffer,
      };
      this.blockBuffer = [];
      return result;
    }

    // Async events от OpenVPN (>INFO, >STATE, >LOG, >NOTIFY и т.д.)
    if (normalized.startsWith(">")) {
      return {
        type: ResponseType.ASYNC_EVENT,
        raw: line,
        content: normalized,
      };
    }

    // Строки блочного ответа (статусы, листы клиентов, и т.д.)
    // Накапливаем до END
    this.blockBuffer.push(normalized);
    return {
      type: ResponseType.BLOCK_LINE,
      raw: line,
      content: normalized,
    };
  }

  /**
   * Очистить внутреннее состояние парсера
   * (при переподключении, например)
   */
  reset(): void {
    this.blockBuffer = [];
    this.clientEnvBuffer = [];
  }
}
