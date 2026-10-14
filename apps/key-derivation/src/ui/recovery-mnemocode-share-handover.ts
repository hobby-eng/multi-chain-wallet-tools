// A Shamir share given in Decode goes to Restore, kept as its first share, as MnemoCode's decode
// sends it to the restore from shares (BackupReading.shareKind tells a share). Decode knows nothing
// of the Restore tab, which only a build with SSKR has: it sends the share as an event, and the
// Restore tab takes it.

/** The event that carries a share from Decode to Restore. */
const FIRST_SHARE_EVENT = "mnemocode-first-share";

/** A share given in place of the codes, and whether it came from a QR image. */
export interface FirstShare {
  readonly text: string;
  readonly fromQr: boolean;
}

/** Offers `share` to the Restore tab; true when it took it, false in a build without one. */
export function handOverShare(share: FirstShare): boolean {
  const event = new CustomEvent<FirstShare>(FIRST_SHARE_EVENT, { detail: share, cancelable: true });
  // The Restore tab cancels the event to say that it took the share.
  return !document.dispatchEvent(event);
}

/** Lets the Restore tab take the shares that Decode hands over. */
export function takeHandedOverShares(take: (share: FirstShare) => void): void {
  document.addEventListener(FIRST_SHARE_EVENT, (event) => {
    if (!(event instanceof CustomEvent)) return;
    event.preventDefault();
    take(event.detail as FirstShare);
  });
}
