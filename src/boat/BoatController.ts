import type { BoatIntent } from './types';

const CONTROL_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

export function intentFromKeys(keys: ReadonlySet<string>): BoatIntent {
  const throttle = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const rudder = Number(keys.has('KeyA')) - Number(keys.has('KeyD'));
  return { throttle, rudder };
}

export class BoatController {
  readonly #keys = new Set<string>();
  readonly #target: Window;

  constructor(target: Window = window) {
    this.#target = target;
  }

  get intent(): BoatIntent {
    return intentFromKeys(this.#keys);
  }

  readonly #keyDown = (event: KeyboardEvent): void => {
    if (!CONTROL_CODES.has(event.code)) return;
    this.#keys.add(event.code);
    event.preventDefault();
  };

  readonly #keyUp = (event: KeyboardEvent): void => {
    this.#keys.delete(event.code);
  };

  readonly clear = (): void => {
    this.#keys.clear();
  };

  readonly #visibility = (): void => {
    if (document.hidden) this.clear();
  };

  start(): void {
    this.#target.addEventListener('keydown', this.#keyDown);
    this.#target.addEventListener('keyup', this.#keyUp);
    this.#target.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.#visibility);
  }

  dispose(): void {
    this.#target.removeEventListener('keydown', this.#keyDown);
    this.#target.removeEventListener('keyup', this.#keyUp);
    this.#target.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.#visibility);
    this.clear();
  }
}
