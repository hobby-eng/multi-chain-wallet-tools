import { descriptorChecksum } from './descriptor.js';

export interface DashCoreImportArtifacts {
  readonly legacyCommand: string;
  readonly fullPolicyGuiCommand: string | null;
  readonly addressFallbackGuiCommand: string;
  readonly rpcJson: string;
}

export function buildDashCoreImport(address: string, redeemScript: string, portableDescriptor: string): DashCoreImportArtifacts {
  if (!/^[1-9A-HJ-NP-Za-km-z]{25,40}$/u.test(address)) throw new Error('Dash P2SH address is invalid.');
  if (!/^(?:[0-9a-f]{2})+$/u.test(redeemScript)) throw new Error('Dash redeemScript must be hexadecimal.');
  const request = {
    scriptPubKey: { address },
    timestamp: 'now',
    redeemscript: redeemScript,
    watchonly: true,
    label: 'PSBT & Multisig Inspector policy',
  } as const;
  const requests = JSON.stringify([request]);
  const options = JSON.stringify({ rescan: false });
  const addressDescriptorPayload = `addr(${address})`;
  const addressDescriptor = `${addressDescriptorPayload}#${descriptorChecksum(addressDescriptorPayload)}`;
  const addressDescriptorRequests = JSON.stringify([{ desc: addressDescriptor, timestamp: 'now', active: false, internal: false, label: 'PSBT & Multisig Inspector policy' }]);
  const [descriptorPayload, suppliedChecksum, ...extra] = portableDescriptor.split('#');
  const fullPolicySupported = extra.length === 0
    && descriptorPayload !== undefined
    && suppliedChecksum === descriptorChecksum(descriptorPayload)
    && /^sh\((?:sorted)?multi\(/u.test(descriptorPayload);
  const fullPolicyRequests = fullPolicySupported
    ? JSON.stringify([{ desc: portableDescriptor, timestamp: 'now', active: false, internal: false, label: 'PSBT & Multisig Inspector policy' }])
    : null;
  return {
    legacyCommand: `dash-cli importmulti \\\n  '${requests}' \\\n  '${options}'`,
    fullPolicyGuiCommand: fullPolicyRequests === null ? null : `importdescriptors ${JSON.stringify(fullPolicyRequests)}`,
    addressFallbackGuiCommand: `importdescriptors ${JSON.stringify(addressDescriptorRequests)}`,
    rpcJson: `${JSON.stringify(
      fullPolicyRequests === null
        ? { jsonrpc: '1.0', id: 'psbt-inspector', method: 'importmulti', params: [[request], { rescan: false }] }
        : { jsonrpc: '1.0', id: 'psbt-inspector', method: 'importdescriptors', params: [JSON.parse(fullPolicyRequests)] },
      null,
      2,
    )}\n`,
  };
}
