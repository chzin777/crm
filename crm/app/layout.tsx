import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";

const graphikRegular = localFont({
  src: "../public/fonts/Graphik-Regular-Trial.otf",
  variable: "--font-graphik-regular",
  weight: "400",
  display: "swap",
});

const graphikLight = localFont({
  src: "../public/fonts/Graphik-Light-Trial.otf",
  variable: "--font-graphik-light",
  weight: "300",
  display: "swap",
});

const graphikMedium = localFont({
  src: "../public/fonts/Graphik-Medium-Trial.otf",
  variable: "--font-graphik-medium",
  weight: "500",
  display: "swap",
});

const graphikSemibold = localFont({
  src: "../public/fonts/Graphik-Semibold-Trial.otf",
  variable: "--font-graphik-semibold",
  weight: "600",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Óticas Brasil | CRM",
  description: "Sistema de Gestão e Relacionamento com Clientes - Óticas Brasil",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${graphikRegular.variable} ${graphikLight.variable} ${graphikMedium.variable} ${graphikSemibold.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
