const MAC_RE = /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/;

/** True for a well-formed MAC like "AA:BB:CC:DD:EE:FF" or "aa-bb-cc-dd-ee-ff". */
export const isValidMac = (mac: string): boolean => MAC_RE.test(mac);
