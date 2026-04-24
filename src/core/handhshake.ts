/**
 * Hold может быть включен или выключен на сервере OpenVPN:
 * ENABLED: hello → БЛОКИРУЕТСЯ → hold → release → ready
 * DISABLED: hello → ready
 * AUTO: hello → ждём 100мс → если hold, то release → ready
 */

export enum HandshakeState {
  IDLE = "idle",
  WAITING_HELLO = "waiting_hello",
  HELLO_RECEIVED = "hello_received",
  WAITING_HOLD = "waiting_hold",
  HOLD_RECEIVED = "hold_received",
  RELEASING_HOLD = "releasing_hold",
  COMPLETE = "complete",
  FAILED = "failed",
}

export enum HoldMode {
  ENABLED = "enabled",   // Hold обязателен
  DISABLED = "disabled", // Hold не приходит
  AUTO = "auto",         // Автодетект
}

export interface HandshakeCallbacks {
  onHelloReceived?: () => void;
  onHoldReceived?: () => void;
  onComplete?: () => void;
  onFailed?: (error: Error) => void;
  onSendCommand?: (command: string) => void;
}

export class HandshakeController {
  private state: HandshakeState = HandshakeState.IDLE;
  private callbacks: HandshakeCallbacks;
  private holdMode: HoldMode;
  private holdTimeout: NodeJS.Timeout | null = null;
  private readonly holdWaitTimeMs: number;

  constructor(
      callbacks: HandshakeCallbacks = {},
      holdMode: HoldMode = HoldMode.AUTO,
      holdWaitTimeMs: number = 100,
  ) {
    this.callbacks = callbacks;
    this.holdMode = holdMode;
    this.holdWaitTimeMs = holdWaitTimeMs;
  }

  getState(): HandshakeState {
    return this.state;
  }

  isComplete(): boolean {
    return this.state === HandshakeState.COMPLETE;
  }

  isFailed(): boolean {
    return this.state === HandshakeState.FAILED;
  }

  start(): void {
    if (this.state !== HandshakeState.IDLE) {
      throw new Error(
          `Cannot start handshake from state ${this.state}. Expected ${HandshakeState.IDLE}`,
      );
    }
    this.setState(HandshakeState.WAITING_HELLO);
  }

  handleManagementHello(): void {
    if (this.state !== HandshakeState.WAITING_HELLO) {
      return;
    }

    this.setState(HandshakeState.HELLO_RECEIVED);
    this.callbacks.onHelloReceived?.();

    if (this.holdMode === HoldMode.DISABLED) {
      // Hold выключен - сразу ready
      this.completeHandshake();
    } else if (this.holdMode === HoldMode.ENABLED) {
      // Hold включен - ждём
      this.setState(HandshakeState.WAITING_HOLD);
    } else if (this.holdMode === HoldMode.AUTO) {
      // Auto-detect: ждём hold 100мс
      this.setState(HandshakeState.WAITING_HOLD);

      this.holdTimeout = setTimeout(() => {
        if (this.state === HandshakeState.WAITING_HOLD) {
          // Hold не пришёл → выключен
          this.completeHandshake();
        }
      }, this.holdWaitTimeMs);
    }
  }

  handleHold(): void {
    if (this.state !== HandshakeState.WAITING_HOLD) {
      return;
    }

    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = null;
    }

    this.setState(HandshakeState.HOLD_RECEIVED);
    this.callbacks.onHoldReceived?.();

    // Отправляем hold release
    this.setState(HandshakeState.RELEASING_HOLD);
    this.callbacks.onSendCommand?.("hold release\n");

    this.completeHandshake();
  }

  fail(error: Error): void {
    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = null;
    }
    this.setState(HandshakeState.FAILED);
    this.callbacks.onFailed?.(error);
  }

  reset(): void {
    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = null;
    }
    this.state = HandshakeState.IDLE;
  }

  private completeHandshake(): void {
    this.setState(HandshakeState.COMPLETE);
    this.callbacks.onComplete?.();
  }

  private setState(newState: HandshakeState): void {
    this.state = newState;
  }
}