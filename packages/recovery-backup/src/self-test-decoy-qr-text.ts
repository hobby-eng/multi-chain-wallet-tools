// The startup known answers of a hidden SeedQR's decoy texts, in microseconds: a contact card and a
// Wi-Fi network against texts written by hand from RFC 2426 and ZXing's WIFI: format, with every
// character those formats escape. The PNG round trip is MnemoCode's and runs on the person's
// button press (hidden-seedqr-self-test.ts). Built with seedqr and mnemocode both.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { decoyKind } from "./decoy-qr-text.js";
import { expectText, now } from "./self-test-helpers.js";

/** A synthetic contact: a fictional 555-01xx number and a domain reserved for examples. */
const PUBLIC_CONTACT = {
  name: "Sam Rivers, Jr.",
  organisation: "Fern; Moss Studio",
  title: "Lead\\Design: Prints\nand Cards",
  phone: "+1 555 0100",
  email: "sam@studio.example",
};
/** Its vCard 3.0, by hand: \ ; , and the line break escaped, the colon kept. */
export const PUBLIC_CONTACT_TEXT = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:;Sam Rivers\\, Jr.;;;",
  "FN:Sam Rivers\\, Jr.",
  "ORG:Fern\\; Moss Studio",
  "TITLE:Lead\\\\Design: Prints\\nand Cards",
  "TEL:+1 555 0100",
  "EMAIL:sam@studio.example",
  "END:VCARD",
].join("\r\n");
const PUBLIC_NETWORK = { ssid: "Cafe;Guest, 2:4", security: "WPA", password: "C0FFEE" };
/** Its WIFI: text, by hand: ; , : escaped, and the password that reads as hexadecimal quoted. */
const PUBLIC_NETWORK_TEXT = 'WIFI:T:WPA;S:Cafe\\;Guest\\, 2\\:4;P:"C0FFEE";;';

export function runDecoyQrTextSelfTest(): CryptoSelfTestReport {
  const started = now();
  expectText("Decoy contact card", decoyKind("contact").text(PUBLIC_CONTACT), PUBLIC_CONTACT_TEXT);
  expectText("Decoy Wi-Fi network", decoyKind("wifi").text(PUBLIC_NETWORK), PUBLIC_NETWORK_TEXT);
  return {
    passed: true,
    checks: ["Decoy QR texts: vCard and Wi-Fi escaping"],
    durationMs: Math.round(now() - started),
  };
}
