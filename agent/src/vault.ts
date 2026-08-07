import { protectSecret, revealSecret } from "./secret-store.js";

/**
 * Camada de cache sobre o DPAPI.
 *
 * Cada chamada ao DPAPI abre o componente nativo isolado. O Agent lê o token
 * a cada heartbeat e a URL RTSP a cada reconexão de câmera; sem cache, isso
 * ainda criaria processos desnecessários durante todo o dia.
 *
 * O cofre decifra uma vez e mantém em memória enquanto o serviço vive. Os
 * segredos ficam no heap do processo do serviço, que roda como LocalSystem —
 * mesmo nível de exposição de qualquer serviço do Windows.
 */
export class SecretVault {
  private readonly cache = new Map<string, string>();
  private readonly migrated = new Set<string>();

  constructor(
    /**
     * Chamado quando um segredo legado é decifrado com sucesso e regravado
     * no formato atual. Quem construir o cofre é responsável por persistir
     * o novo valor na configuração.
     */
    private readonly onMigrated?: (previous: string, next: string) => Promise<void>,
  ) {}

  /** Cifra um valor novo. Já popula o cache para evitar releitura imediata. */
  async seal(plain: string) {
    const stored = await protectSecret(plain);
    this.cache.set(stored, plain);
    return stored;
  }

  /**
   * Decifra um valor guardado. Se vier no formato legado, regrava no formato
   * atual e avisa o chamador uma única vez por segredo.
   */
  async open(stored: string) {
    const cached = this.cache.get(stored);
    if (cached !== undefined) return cached;

    const result = await revealSecret(stored);
    this.cache.set(stored, result.value);

    if (result.legacy && !this.migrated.has(stored)) {
      this.migrated.add(stored);

      if (this.onMigrated) {
        const next = await protectSecret(result.value);
        this.cache.set(next, result.value);
        await this.onMigrated(stored, next);
      }
    }

    return result.value;
  }

  /**
   * Esvazia o cache. Chamado quando a configuração é recarregada do disco,
   * para não servir um token já revogado.
   */
  clear() {
    this.cache.clear();
    this.migrated.clear();
  }
}
