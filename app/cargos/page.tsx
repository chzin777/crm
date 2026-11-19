import { redirect } from "next/navigation";

/** A gestão de cargos foi unificada em /permissoes; links e abas antigas de /cargos caem lá. */
export default function CargosPage() {
  redirect("/permissoes");
}
