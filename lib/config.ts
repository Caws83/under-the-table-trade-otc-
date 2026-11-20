import { isAddress, type Address } from "viem";

function envAddress(value: string | undefined): Address | undefined {
  if (!value || !isAddress(value)) return undefined;
  return value;
}

// Read each public variable by its literal name so Next can inline it into the browser bundle.
export const deskAddress = envAddress(process.env.NEXT_PUBLIC_DESK_ADDRESS);
export const factoryAddress = envAddress(process.env.NEXT_PUBLIC_FACTORY_ADDRESS);
export const stakeTokenAddress = envAddress(process.env.NEXT_PUBLIC_TOKEN_STAKE);
export const payTokenAddress = envAddress(process.env.NEXT_PUBLIC_TOKEN_PAY);
export const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";
export const devMode =
  process.env.NEXT_PUBLIC_DEV_MODE === "true" &&
  Boolean(process.env.NEXT_PUBLIC_DEV_KEY_A) &&
  Boolean(process.env.NEXT_PUBLIC_DEV_KEY_B);

export const NATIVE = "0x0000000000000000000000000000000000000000" as Address;

export function isNative(token: Address) {
  return token.toLowerCase() === NATIVE;
}
