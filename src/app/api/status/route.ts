import { NextResponse } from "next/server";
import { getProviderStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getProviderStatus());
}
