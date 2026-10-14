import { PageStampClient } from "./PageStampClient";

/**
 * Put one of these in every `cached` page (`lib/navigation/cachePolicy.ts`; a test checks).
 *
 * A server component so each render draws its own id: the browser cannot otherwise tell a
 * payload it just fetched from one it is showing again from the cache, and the arrival refresh
 * (`PageStampClient`) must know which. Renders nothing.
 */
export function PageStamp() {
  return <PageStampClient renderId={crypto.randomUUID()} />;
}
