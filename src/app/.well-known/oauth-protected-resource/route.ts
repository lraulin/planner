import { corsJson, corsOptions } from "@/lib/oauth/http";
import { protectedResourceMetadata } from "@/lib/oauth/metadata";
import { publicOrigin } from "@/lib/oauth/origin";

export function GET(request: Request) {
  return corsJson(protectedResourceMetadata(publicOrigin(request)));
}

export function OPTIONS() {
  return corsOptions();
}
