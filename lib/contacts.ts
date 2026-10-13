export type ContactCategory = "cliente" | "lead" | "nps" | "inativo";

export interface Contact {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  categoria: ContactCategory;
  segmento: string;
  ultimoContato: string;
  compras: number;
  totalGasto: number;
  iniciais: string;
}

export const initialContacts: Contact[] = [
  { id: "ct-1", nome: "Mariana Albuquerque", telefone: "(11) 98721-4432", email: "mariana.albuquerque@email.com", dataNascimento: "08/06/1985", categoria: "cliente", segmento: "Recorrente", ultimoContato: "Hoje, há 30 min", compras: 3, totalGasto: 3420, iniciais: "MA" },
  { id: "ct-2", nome: "Carlos Eduardo Silveira", telefone: "(11) 97134-8890", email: "carlos.silveira@email.com", dataNascimento: "25/07/1982", categoria: "cliente", segmento: "VIP", ultimoContato: "12/09/2026", compras: 5, totalGasto: 4890, iniciais: "CS" },
  { id: "ct-3", nome: "Guilherme Sampaio", telefone: "(11) 99120-7734", email: "guilherme.sampaio@email.com", dataNascimento: "12/04/1988", categoria: "lead", segmento: "Lead quente", ultimoContato: "Orçamento recente", compras: 0, totalGasto: 0, iniciais: "GS" },
  { id: "ct-4", nome: "Beatriz Nogueira Dias", telefone: "(11) 99451-2210", email: "beatriz.nogueira@email.com", dataNascimento: "17/11/1974", categoria: "nps", segmento: "NPS 30 dias", ultimoContato: "14/09/2026", compras: 2, totalGasto: 2450, iniciais: "BN" },
  { id: "ct-5", nome: "Roberto Mendes Filho", telefone: "(11) 98112-9933", email: "roberto.mendes@email.com", dataNascimento: "14/03/1968", categoria: "inativo", segmento: "Inativo há 8 meses", ultimoContato: "02/02/2026", compras: 3, totalGasto: 1940, iniciais: "RM" },
  { id: "ct-6", nome: "Juliana Peixoto Ramos", telefone: "(11) 97650-1122", email: "juliana.peixoto@email.com", dataNascimento: "30/01/1989", categoria: "inativo", segmento: "Inativa há 1 ano", ultimoContato: "15/10/2025", compras: 2, totalGasto: 1390, iniciais: "JP" },
];
