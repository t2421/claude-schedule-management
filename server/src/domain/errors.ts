// Domain errors. Pure — no I/O assumptions. Adapters at the edges (HTTP, CLI)
// translate these into protocol-specific responses.

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {}
export class NotFoundError extends DomainError {}
export class SchedulerError extends DomainError {}
export class PickerCancelledError extends DomainError {
  constructor() {
    super("picker cancelled");
  }
}
