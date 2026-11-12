"use client";

import { createContext, useContext } from "react";

export type Deployment = { hosted: boolean; host: string | null };

const DeploymentContext = createContext<Deployment>({ hosted: false, host: null });

export function DeploymentProvider({ value, children }: { value: Deployment; children: React.ReactNode }) {
  return <DeploymentContext.Provider value={value}>{children}</DeploymentContext.Provider>;
}

export function useDeployment(): Deployment {
  return useContext(DeploymentContext);
}
