// Module hooks that resolve playwright-core to the launch stub beside this file.
const stub = new URL("./playwright-launch-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "playwright-core") return { url: stub, shortCircuit: true };
  return nextResolve(specifier, context);
}
