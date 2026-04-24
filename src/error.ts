export class OpenvpnCommandError extends Error {
  constructor(public readonly raw: string) {
    const message = raw.replace(/^ERROR:\s*/i, "").trim();
    super(message);
    this.name = "OpenvpnCommandError";
  }
}
