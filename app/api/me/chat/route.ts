import { NextResponse } from "next/server";
import { requireChatActor } from "@/lib/chat/access";

export async function GET() {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id, name, capabilities, queueIds } = guard.actor;
  return NextResponse.json({ id, name, capabilities, queueIds });
}
