/** Perfis de cliente fictício do teste da página /ia (usado também no client: sem banco nem disco). */
export type SimulatedProfileId = "novo" | "recorrente";
export const SIMULATED_PROFILES: { id: SimulatedProfileId; label: string; name: string; hint: string }[] = [
  { id: "novo", label: "Cliente novo (sem histórico)", name: "Cliente Teste", hint: "Sem cadastro no ERP, como um número que escreve pela primeira vez." },
  { id: "recorrente", label: "Cliente recorrente (com pedido no ERP)", name: "Maria Teste", hint: "3 compras, último pedido de lentes multifocais há 14 meses (receita provavelmente vencida)." },
];
