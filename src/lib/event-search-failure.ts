/**
 * Conserva compatibilidade com a busca tradicional em páginas que toleram
 * erro, mas impede que a Pesquisa IA confunda erro de RPC com ausência de dados.
 */
export function didEventSearchFail(
  error: { message: string } | null | undefined,
  throwOnError = false,
): boolean {
  if (!error) return false;
  if (throwOnError) {
    // Não expor nome de tabela, SQL, identificadores ou mensagens internas.
    throw new Error("event_search_unavailable");
  }
  return true;
}
