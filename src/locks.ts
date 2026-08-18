// En mémoire : au pire, un redémarrage du bot oublie un cooldown.
export class Locks {
  private readonly busy = new Set<string>();
  private readonly lastAction = new Map<string, number>();

  constructor(private readonly cooldownSeconds: number) {}

  acquire(serverKey: string): boolean {
    if (this.busy.has(serverKey)) return false;
    this.busy.add(serverKey);
    return true;
  }

  release(serverKey: string): void {
    this.busy.delete(serverKey);
  }

  cooldownLeft(userId: string, serverKey: string): number {
    const last = this.lastAction.get(`${userId}:${serverKey}`);
    if (last === undefined) return 0;
    const left = this.cooldownSeconds * 1000 - (Date.now() - last);
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  markUsed(userId: string, serverKey: string): void {
    this.lastAction.set(`${userId}:${serverKey}`, Date.now());
  }
}
