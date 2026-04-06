# OpenVPN Manager Wrapper

OpenVPN Manager Wrapper — это легковесная TypeScript-библиотека без зависимостей, обеспечивающая удобный доступ к
OpenVPN Management Interface. Она позволяет подключаться к серверу, управлять клиентами, отправлять типизированные команды и получать события в режиме реального времени.

Библиотека не имеет зависимостей — используется только стандартный функционал Node.js.
Методы можно заменить на аналоги для других рантаймов (Deno, Bun).\
Проект написан на TypeScript, поэтому вы получаете статическую типизацию и автодополнение в вашей IDE.

Для удобной интеграции с NestJS используйте обёртку:\
👉 [openvpn-manager-nestjs](https://github.com/Leo5878/openvpn-manager-nestjs)

[Документация на английском](/README.md)

## Установка
### npm
```bash
npm install @ad0nis/openvpn-manager
```

### yarn
```bash
yarn add @ad0nis/openvpn-manager
```

## Возможности
- События подключения и отключения клиентов
- Получение полного списка активных подключений
- Мониторинг трафика клиентов
- Типизированные async-команды с promise-based ответами
- Обработка ошибок через `OpenvpnCommandError`

## Быстрый старт

Создайте экземпляр `OpenvpnManager` и подключитесь к серверу.\
О том как настроить OpenVPN Manager читайте [здесь](./docs/Openvpn-manager.md) или в [официальной документации OpenVPN](https://openvpn.net/community-docs/community-articles/openvpn-2-6-manual.html#management-interface-options-177179).

### Подключение
```ts
const api = new OpenvpnManager({
  id: "srv1",         // Идентификатор сервера (любая строка)
  host: "127.0.0.1",  // Адрес до OpenVPN manager
  port: 7505,         // Порт до OpenVPN manager
  timeout: 5000,      // Таймаут подключения в ms (по умолчанию 5000)
});

await api.connect();
```

На этом этапе соединение с OpenVPN установлено.

### Получение событий

```ts
api.on("client:connection", (client: ConnectionClient) => {
  // Обработка подключившегося клиента
});

api.once("client:list", (clients: Cl) => {
  // Обработка списка клиентов. Сработает один раз
});
```

Полный список доступных событий приведён в разделе [События](#события).

## Параметры конструктора

Дополнительные параметры, доступные при создании экземпляра `OpenvpnManager`:

- `event` — собственный EventEmitter для обработки событий (по умолчанию создаётся внутренний эмиттер).
- `logger` — логгер для ведения логов (по умолчанию используется `console`).
- `reconnect` — управляет поведением при разрыве соединения. По умолчанию `always` — клиент автоматически переподключается. `never` отключает автоматическое переподключение. Возможные значения: `always`, `never`.

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
    event: emitter,   // Кастомный эмиттер событий
    logger: console,  // По умолчанию используется console
  }
);
```

## События

Все события и интерфейсы можно посмотреть в файле с [типами](https://github.com/Leo5878/openvpn-manager/blob/main/src/event-responses.types.ts)

| Событие              | Тип                | Описание                                                               |
|----------------------|--------------------|------------------------------------------------------------------------|
| `client:connection`  | `ConnectionEvent`  | Клиент прошёл аутентификацию, сессия создаётся. Туннель ещё не активен |
| `client:established` | `ConnectionEvent`  | Туннель полностью поднят, клиент готов к передаче трафика              |
| `client:list`        | `Cl[]`             | Список подключённых клиентов                                           |
| `bytecount:cli`      | `ByteCount`        | Информация о трафике клиента                                           |
| `client:disconnect`  | `ClientDisconnect` | Возвращается массив из CommonName (_планируется дополнить_)            |
| `socket:error`       | `SocketError`      | Событие о возникновении ошибки с сокетом во время подключения          |

### client:list

Событие `client:list` возвращает информацию о подключённых клиентах:

* CN (имя клиента)
* Реальный адрес (IP:порт)
* Виртуальный IP клиента
* Объём входящего и исходящего трафика
* Дата и время подключения

Подробнее в официальной документации: [OpenVPN Management Interface Documentation](https://openvpn.net/community-resources/management-interface/)

## Команды

`OpenvpnManager` предоставляет типизированные async-обёртки для наиболее распространённых команд OpenVPN Management Interface.
Каждая команда возвращает промис и бросает `OpenvpnCommandError`, если OpenVPN ответил ошибкой.

### Управление клиентами

```ts
// Отключить клиента по Common Name
await api.killClientByCn("client-cn");

// Отключить клиента по реальному адресу (ip:port)
await api.killClientByAddress("1.2.3.4:12345");

// Отключить клиента по числовому client ID (из client:list)
await api.clientKill(42);
await api.clientKill(42, "restart");

// Одобрить аутентификацию клиента (при использовании --auth-user-pass-verify)
await api.clientAuth(clientId, keyId);
await api.clientAuthNt(clientId, keyId);

// Отклонить аутентификацию клиента
await api.clientDeny(clientId, keyId, "Access denied");
await api.clientDeny(clientId, keyId, "Access denied", "Причина для клиента");
```

### Информация о сервере

```ts
// Получить версию OpenVPN и Management Interface
const version = await api.getVersion();
console.log(version.openvpnVersion);     // "OpenVPN 2.6.x ..."
console.log(version.managementVersion);  // "5"

// Получить PID процесса OpenVPN
const { pid } = await api.getPid();
console.log(pid); // 12345

// Получить агрегированную статистику сервера (легче, чем status)
const stats = await api.getLoadStats();
console.log(stats.nClients);  // количество подключённых клиентов
console.log(stats.bytesIn);
console.log(stats.bytesOut);

// Запросить список клиентов как промис
const clients = await api.requestStatus();
```

### Мониторинг трафика

```ts
// Установить интервал отправки событий BYTECOUNT_CLI в секундах (0 — отключить)
await api.setBytecount(5);
```

### Логирование

```ts
await api.enableLog();
await api.disableLog();

const lines = await api.getLog("all");
const last10 = await api.getLog(10);

await api.setVerbosity(4);
await api.setMute(10);
```

### Сигналы

```ts
// Перечитать конфиг и переподключить всех клиентов
await api.sendSignal("SIGHUP");

// «Мягкий» рестарт (без закрытия tun-интерфейса)
await api.sendSignal("SIGUSR1");

// Вывести статистику в лог
await api.sendSignal("SIGUSR2");

// Завершить процесс
await api.sendSignal("SIGTERM");
```

### Аутентификация

```ts
// Передать credentials в ответ на >PASSWORD:
await api.sendAuth("Auth", "username", "password");

// Установить поведение при ошибке аутентификации
await api.setAuthRetry("nointeract");
```

### Hold

Hold-режим заставляет OpenVPN приостановиться перед (пере)подключением и ждать команды `holdRelease`.
Полезно, когда нужно подготовить credentials или убедиться, что ваше приложение готово до запуска туннеля.

```ts
await api.holdOn();

// ... что-то делаем, например запрашиваем пароль у пользователя ...

await api.holdRelease();
```

### Обработка ошибок

Если OpenVPN отвечает ошибкой, команда бросает `OpenvpnCommandError`:

```ts
import { OpenvpnCommandError } from "@ad0nis/openvpn-manager";

try {
  await api.killClientByCn("nonexistent");
} catch (e) {
  if (e instanceof OpenvpnCommandError) {
    console.error(e.message); // "common name 'nonexistent' not found"
    console.error(e.raw);     // сырой ответ от OpenVPN
  }
}
```

### Низкоуровневый доступ

Если нужно отправить команду, которой нет среди типизированных обёрток, используйте `writeSocket` напрямую:

```ts
api.writeSocket("custom-command\r\n"); // \r\n обязателен в конце
```

> [!NOTE]
> `writeSocket` — низкоуровневый метод. Он не интегрируется с очередью команд, ответ нужно обрабатывать через событие `data`.

```ts
api.on("data", (data: string) => {
  // Сырые данные от OpenVPN
});
```