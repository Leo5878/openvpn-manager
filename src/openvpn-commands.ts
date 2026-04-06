import { EventEmitter } from "node:events";
import { OpenvpnCore, Connect, Options } from "./core.js";
import { OpenvpnCommandError } from "./error.js";

// ─── Response Types ──────────────────────────────────────────────────────────── 

export type Signal = "SIGHUP" | "SIGTERM" | "SIGUSR1" | "SIGUSR2" | "SIGINT";
export type AuthRetryMode = "none" | "nointeract" | "interact";
export type LogLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

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

export interface LoadStatsInfo {
    /** Number of currently connected clients */
    nClients: number;
    /** Total bytes in */
    bytesIn: number;
    /** Total bytes out */
    bytesOut: number;
    raw: string;
}

export interface RsaSignResult {
    signature: string;
    raw: string;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class OpenvpnCommands extends OpenvpnCore {
    /**
     * Очередь resolver-ов ожидающих команд.
     * Каждый вызов sendCommand кладёт сюда resolve своего промиса,
     * а listenForResponses забирает первый при получении ответа.
     */
    private pendingCommands: Array<{
        resolve: (response: string) => void;
        reject: (err: Error) => void;
    }> = [];

    constructor(server: Connect, emitter: EventEmitter, opts: Options) {
        super(server, emitter, opts);
        this.listenForResponses();
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    private listenForResponses(): void {
        this.emitter.on("data", (data: string) => {
            /**
             * Ответы на `status 2` всегда содержат маркер CLIENT_LIST или TITLE,
             * это данные для парсера событий в OpenvpnManager — пропускаем их здесь.
             * Всё остальное — ответ на пользовательскую команду из очереди.
             */
            const isStatusResponse =
                data.includes("CLIENT_LIST") ||
                data.startsWith("TITLE") ||
                data.includes("ROUTING_TABLE") ||
                data.includes("GLOBAL_STATS");

            if (isStatusResponse) return;

            const pending = this.pendingCommands.shift();
            if (!pending) return;

            if (data.trimStart().startsWith("ERROR")) {
                pending.reject(new OpenvpnCommandError(data));
            } else {
                pending.resolve(data);
            }
        });
    }

    /**
     * Базовый метод: кладёт resolve в очередь, отправляет команду в сокет.
     * Все публичные команды строятся поверх него.
     */
    protected sendCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.pendingCommands.push({ resolve, reject });
            this.writeSocket(`${command}\r\n`);
        });
    }

    private parseSuccess(raw: string): CommandResult {
        return {
            success: raw.trimStart().startsWith("SUCCESS"),
            raw,
        };
    }

    // ─── Client Management ────────────────────────────────────────────────────

    /**
     * Отключить клиента по Common Name.
     * Если к серверу подключено несколько клиентов с одним CN — отключит всех.
     *
     * OpenVPN: `kill cn`
     */
    async killClientByCn(commonName: string): Promise<CommandResult> {
        const raw = await this.sendCommand(`kill ${commonName}`);
        return this.parseSuccess(raw);
    }

    /**
     * Отключить клиента по реальному адресу в формате `ip:port`.
     *
     * OpenVPN: `kill ip:port`
     */
    async killClientByAddress(address: string): Promise<CommandResult> {
        const raw = await this.sendCommand(`kill ${address}`);
        return this.parseSuccess(raw);
    }

    /**
     * Отключить клиента по его числовому client-id (из `status 2`).
     *
     * OpenVPN: `client-kill cid [reason]`
     *
     * @param clientId  — числовой ID клиента
     * @param reason    — опциональная причина (halted | restart)
     */
    async clientKill(
        clientId: number,
        reason?: "halted" | "restart"
    ): Promise<CommandResult> {
        const cmd = reason
            ? `client-kill ${clientId} ${reason}`
            : `client-kill ${clientId}`;
        const raw = await this.sendCommand(cmd);
        return this.parseSuccess(raw);
    }

    /**
     * Одобрить аутентификацию клиента при использовании `--auth-user-pass-verify`
     * с `via-file` или плагина аутентификации.
     *
     * OpenVPN: `client-auth cid kid`
     *
     * @param clientId  — числовой ID клиента
     * @param keyId     — ключ (kid) из события CLIENT_CONNECT
     */
    async clientAuth(clientId: number, keyId: number): Promise<CommandResult> {
        const raw = await this.sendCommand(`client-auth ${clientId} ${keyId}`);
        return this.parseSuccess(raw);
    }

    /**
     * Одобрить аутентификацию клиента без дополнительных параметров.
     * Упрощённая версия clientAuth.
     *
     * OpenVPN: `client-auth-nt cid kid`
     */
    async clientAuthNt(clientId: number, keyId: number): Promise<CommandResult> {
        const raw = await this.sendCommand(`client-auth-nt ${clientId} ${keyId}`);
        return this.parseSuccess(raw);
    }

    /**
     * Отклонить аутентификацию клиента с указанием причины.
     *
     * OpenVPN: `client-deny cid kid reason [client-reason]`
     *
     * @param clientId      — числовой ID клиента
     * @param keyId         — ключ (kid) из события CLIENT_CONNECT
     * @param serverReason  — причина в логах сервера
     * @param clientReason  — причина, которую увидит клиент (опционально)
     */
    async clientDeny(
        clientId: number,
        keyId: number,
        serverReason: string,
        clientReason?: string
    ): Promise<CommandResult> {
        const cmd = clientReason
            ? `client-deny ${clientId} ${keyId} ${serverReason} ${clientReason}`
            : `client-deny ${clientId} ${keyId} ${serverReason}`;
        const raw = await this.sendCommand(cmd);
        return this.parseSuccess(raw);
    }

    // ─── Server Info ─────────────────────────────────────────────────────────

    /**
     * Получить версию Management Interface и OpenVPN.
     *
     * OpenVPN: `version`
     */
    async getVersion(): Promise<VersionInfo> {
        const raw = await this.sendCommand("version");
        // Формат ответа:
        //   OpenVPN Version: OpenVPN 2.6.x ...
        //   Management Interface Version: 5
        //   END
        const mgmtMatch = raw.match(/Management Interface Version:\s*(\S+)/);
        const ovpnMatch = raw.match(/OpenVPN Version:\s*(.+)/);
        return {
            managementVersion: mgmtMatch?.[1] ?? "unknown",
            openvpnVersion: ovpnMatch?.[1]?.trim() ?? "unknown",
            raw,
        };
    }

    /**
     * Получить PID процесса OpenVPN.
     *
     * OpenVPN: `pid`
     */
    async getPid(): Promise<PidInfo> {
        const raw = await this.sendCommand("pid");
        // Формат: "SUCCESS: pid=12345"
        const match = raw.match(/pid=(\d+)/);
        return {
            pid: match ? Number(match[1]) : -1,
            raw,
        };
    }

    /**
     * Получить агрегированную статистику сервера.
     *
     * OpenVPN: `load-stats`
     *
     * Возвращает количество клиентов и суммарный трафик.
     * Не путать с `status 2` — этот запрос значительно легче.
     */
    async getLoadStats(): Promise<LoadStatsInfo> {
        const raw = await this.sendCommand("load-stats");
        // Формат: "SUCCESS: nclients=2,bytesin=12345,bytesout=67890"
        const nClients = raw.match(/nclients=(\d+)/);
        const bytesIn = raw.match(/bytesin=(\d+)/);
        const bytesOut = raw.match(/bytesout=(\d+)/);

        return {
            nClients: nClients ? Number(nClients[1]) : 0,
            bytesIn: bytesIn ? Number(bytesIn[1]) : 0,
            bytesOut: bytesOut ? Number(bytesOut[1]) : 0,
            raw,
        };
    }

    // ─── Traffic Monitoring ───────────────────────────────────────────────────

    /**
     * Установить интервал отправки событий BYTECOUNT_CLI (в секундах).
     * `0` — отключить события.
     *
     * OpenVPN: `bytecount n`
     */
    async setBytecount(intervalSeconds: number): Promise<CommandResult> {
        const raw = await this.sendCommand(`bytecount ${intervalSeconds}`);
        return this.parseSuccess(raw);
    }

    // ─── Logging ──────────────────────────────────────────────────────────────

    /**
     * Включить получение лог-сообщений через Management Interface.
     * После включения сервер будет эмитить события `>LOG:...`
     *
     * OpenVPN: `log on`
     */
    async enableLog(): Promise<CommandResult> {
        const raw = await this.sendCommand("log on");
        return this.parseSuccess(raw);
    }

    /**
     * Отключить получение лог-сообщений.
     *
     * OpenVPN: `log off`
     */
    async disableLog(): Promise<CommandResult> {
        const raw = await this.sendCommand("log off");
        return this.parseSuccess(raw);
    }

    /**
     * Получить последние N строк лога.
     *
     * OpenVPN: `log all` или `log n`
     *
     * @param lines — количество строк или "all" для всего буфера
     */
    async getLog(lines: number | "all" = "all"): Promise<string[]> {
        const raw = await this.sendCommand(`log ${lines}`);
        return raw
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith("END"));
    }

    /**
     * Установить уровень verbosity логов (0–11).
     *
     * OpenVPN: `verb n`
     */
    async setVerbosity(level: LogLevel): Promise<CommandResult> {
        const raw = await this.sendCommand(`verb ${level}`);
        return this.parseSuccess(raw);
    }

    /**
     * Установить уровень mute (подавление повторяющихся сообщений).
     *
     * OpenVPN: `mute n`
     */
    async setMute(n: number): Promise<CommandResult> {
        const raw = await this.sendCommand(`mute ${n}`);
        return this.parseSuccess(raw);
    }

    // ─── Hold / Reconnect ─────────────────────────────────────────────────────

    /**
     * Получить текущий статус hold.
     *
     * OpenVPN: `hold`
     */
    async getHoldStatus(): Promise<CommandResult> {
        const raw = await this.sendCommand("hold");
        return this.parseSuccess(raw);
    }

    /**
     * Включить режим hold — сервер будет ждать команды `hold release` перед
     * следующим подключением.
     *
     * OpenVPN: `hold on`
     */
    async holdOn(): Promise<CommandResult> {
        const raw = await this.sendCommand("hold on");
        return this.parseSuccess(raw);
    }

    /**
     * Отключить режим hold.
     *
     * OpenVPN: `hold off`
     */
    async holdOff(): Promise<CommandResult> {
        const raw = await this.sendCommand("hold off");
        return this.parseSuccess(raw);
    }

    /**
     * Отпустить процесс из hold-состояния (разрешить продолжить работу).
     *
     * OpenVPN: `hold release`
     */
    async holdRelease(): Promise<CommandResult> {
        const raw = await this.sendCommand("hold release");
        return this.parseSuccess(raw);
    }

    // ─── Signals ─────────────────────────────────────────────────────────────

    /**
     * Отправить сигнал процессу OpenVPN.
     *
     * | Signal    | Действие                                         |
     * |-----------|--------------------------------------------------|
     * | SIGHUP    | Перечитать конфиг и переподключить всех клиентов |
     * | SIGUSR1   | «Мягкий» рестарт (без закрытия tun-интерфейса)  |
     * | SIGUSR2   | Вывести статистику в лог                        |
     * | SIGTERM   | Завершить процесс                               |
     * | SIGINT    | Завершить процесс (аналог Ctrl+C)               |
     *
     * OpenVPN: `signal <SIGNAL>`
     */
    async sendSignal(signal: Signal): Promise<CommandResult> {
        const raw = await this.sendCommand(`signal ${signal}`);
        return this.parseSuccess(raw);
    }

    // ─── Auth ─────────────────────────────────────────────────────────────────

    /**
     * Передать имя пользователя и пароль для аутентификации.
     * Используется когда OpenVPN запрашивает `>PASSWORD:`.
     *
     * OpenVPN: `username "Auth" user` / `password "Auth" pass`
     *
     * @param type    — тип запроса (обычно "Auth")
     * @param username
     * @param password
     */
    async sendAuth(
        type: string,
        username: string,
        password: string
    ): Promise<CommandResult> {
        await this.sendCommand(`username "${type}" ${username}`);
        const raw = await this.sendCommand(`password "${type}" ${password}`);
        return this.parseSuccess(raw);
    }

    /**
     * Установить поведение при ошибке аутентификации.
     *
     * | Режим       | Поведение                                              |
     * |-------------|--------------------------------------------------------|
     * | none        | Завершить соединение при ошибке аутентификации         |
     * | nointeract  | Переподключиться без запроса пароля                    |
     * | interact    | Переподключиться с запросом пароля (через management)  |
     *
     * OpenVPN: `auth-retry none | nointeract | interact`
     */
    async setAuthRetry(mode: AuthRetryMode): Promise<CommandResult> {
        const raw = await this.sendCommand(`auth-retry ${mode}`);
        return this.parseSuccess(raw);
    }

    // ─── RSA / PKCS#11 ───────────────────────────────────────────────────────

    /**
     * Подписать данные приватным ключом (ответ на `>RSA_SIGN:`).
     *
     * OpenVPN: `rsa-sig`
     *
     * @param base64Data — данные для подписи в base64
     */
    async rsaSign(base64Data: string): Promise<RsaSignResult> {
        // Протокол: отправить `rsa-sig`, затем данные, затем `END`
        const raw = await this.sendCommand(
            `rsa-sig\r\n${base64Data}\r\nEND`
        );
        return {
            signature: raw.trim(),
            raw,
        };
    }

    // ─── Misc ─────────────────────────────────────────────────────────────────

    /**
     * Корректно завершить сессию Management Interface (не завершает OpenVPN).
     *
     * OpenVPN: `quit`
     */
    async quit(): Promise<void> {
        this.writeSocket("quit\r\n");
    }
}