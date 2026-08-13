import { corsJson, corsOptions } from "@/lib/oauth/http";
import { authorizationServerMetadata } from "@/lib/oauth/metadata";
import { publicOrigin } from "@/lib/oauth/origin";

export function GET(request: Request) {
  return corsJson(authorizationServerMetadata(publicOrigin(request)));
}

export function OPTIONS() {
  return corsOptions();
}
