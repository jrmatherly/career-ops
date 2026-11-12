import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False on the server and during hydration, true after: gates text that depends on the viewer's clock or time zone. */
export const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);
