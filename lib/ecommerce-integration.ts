import "server-only";
import { randomUUID } from "node:crypto";

const ecommerceApiUrl = process.env.ECOMMERCE_API_URL?.trim().replace(/\/+$/, "");
const integrationSecret = process.env.INTEGRATION_SHARED_SECRET;

export async function sendEcommerceIntegrationEvent(type: string, data: Record<string, unknown>) {
  if (!ecommerceApiUrl || !integrationSecret) {
    throw new Error("Configure ECOMMERCE_API_URL e INTEGRATION_SHARED_SECRET no servidor do CRM.");
  }

  const response = await fetch(`${ecommerceApiUrl}/api/integrations/crm/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integrationSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ eventId: randomUUID(), type, data }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || `E-commerce respondeu HTTP ${response.status}.`);
  }
}
