"use client";

import type { InputHTMLAttributes } from "react";
import { isAllowedNumericKey, maskMoney, moneyInputToNumber, quantityInputToNumber } from "@/lib/money-input";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode"> & { value: number; onValueChange: (value: number) => void };

/** Bloqueia letras/símbolos no teclado e na colagem; o valor sempre sai já convertido para número. */
function guard(props: BaseProps, parse: (text: string) => number) {
  const { onValueChange, onKeyDown, onPaste } = props;
  return {
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isAllowedNumericKey(event)) event.preventDefault();
      onKeyDown?.(event);
    },
    onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault();
      onValueChange(parse(event.clipboardData.getData("text")));
      onPaste?.(event);
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onValueChange(parse(event.target.value)),
  };
}

/** Campo de dinheiro com máscara "R$ 1.234,56" (centavos andando), só números, teclado numérico no celular. */
export function MoneyInput(props: BaseProps) {
  const { value, onValueChange: _onValueChange, placeholder = "R$ 0,00", ...rest } = props;
  void _onValueChange;
  return <input {...rest} type="text" inputMode="decimal" autoComplete="off" value={maskMoney(value)} placeholder={placeholder} {...guard(props, moneyInputToNumber)} />;
}

/** Campo de quantidade: só inteiros positivos, sem vírgula nem cifrão. */
export function QuantityInput(props: BaseProps) {
  const { value, onValueChange: _onValueChange, placeholder = "0", ...rest } = props;
  void _onValueChange;
  return <input {...rest} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value > 0 ? String(Math.round(value)) : ""} placeholder={placeholder} {...guard(props, quantityInputToNumber)} />;
}
