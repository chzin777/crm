export type ContactCategory = "cliente" | "lead" | "nps" | "inativo";

export interface Contact {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  categoria: ContactCategory;
  segmento: string;
  loja?: string;
  npsRatings?: number[];
  ultimoContato: string;
  compras: number;
  totalGasto: number;
  iniciais: string;
  cpf?: string;
  genero?: string;
  ocupacao?: string;
  cidade?: string;
  bairro?: string;
  estado?: string;
  ultimaCompra?: string;
  prescricaoValidade?: string;
  criadoEm?: string;
}
