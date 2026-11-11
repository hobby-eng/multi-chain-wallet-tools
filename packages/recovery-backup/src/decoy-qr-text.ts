// The visible text of a decoy QR: what ordinary scanners show of a QR whose hidden record MnemoCode
// keeps after the terminator (MnemoCode docs/HIDDEN_QR.md). Each kind is one of the ordinary
// contents that phone cameras open, written with the escaping of its own format:
// - contact card: vCard 3.0 (RFC 2426). Text values escape \ ; , and line breaks (its section 4),
//   as MnemoCode's own card contact does (mnemocode-cards CardProfile::qr_contact); a colon needs
//   none, since a reader splits a line at its first colon only. Lines end in CRLF and are not
//   folded: folding is a SHOULD of RFC 2425, QR readers take long lines, and every byte counts.
// - website: an http or https URL, as the URL parser writes it.
// - plain text: as typed.
// - Wi-Fi network: ZXing's WIFI: text (zxing wiki "Barcode Contents"): \ ; , : and " are escaped
//   with a backslash, and a value that could be read as hexadecimal is put in double quotes.
// - email: a mailto: URI (RFC 6068) whose address, subject and message are percent-encoded, with
//   line breaks as CRLF.
// - phone: a tel: URI (RFC 3966) of the digits and the separators - . ( ), spaces left out.
// - location: a geo: URI (RFC 5870) of decimal degrees.
// Every field refuses control characters other than the line breaks CR and LF (and the tab, in a
// plain text and a vCard text value), and half of a surrogate pair, which no format above writes
// as typed. The visible text is not secret, and
// nothing here keeps or logs it.
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

/** The kinds of decoy, in the order a page offers them. */
export type DecoyKindId = "contact" | "website" | "text" | "wifi" | "email" | "phone" | "location";

/** The values a person gave for a kind's fields, by field name; a missing field is empty. */
export type DecoyValues = Readonly<Record<string, string | undefined>>;

/** One answer of a choice field. */
export interface DecoyChoice {
  readonly value: string;
  readonly label: string;
}

/** One field of a decoy kind, for a page to ask. */
export interface DecoyField {
  readonly name: string;
  readonly label: string;
  /** A line of text, several lines, or one of `choices` (the first is the default). */
  readonly input: "line" | "lines" | "choice";
  /** The browser input type of a line, for its keyboard; a plain text line where absent. */
  readonly type?: "email" | "tel" | "url";
  readonly required: boolean;
  /** A short hint beside the label. */
  readonly note?: string;
  readonly choices?: readonly DecoyChoice[];
  /**
   * Whether a tab is taken as typed: a plain text, or a vCard text value, whose formats keep white
   * space (RFC 2426). Every other field refuses it with the other control characters.
   */
  readonly tabs?: true;
}

/** One kind of decoy: its fields and the rule that writes its visible text. */
export interface DecoyKind {
  readonly id: DecoyKindId;
  readonly label: string;
  readonly fields: readonly DecoyField[];
  /** The visible text of `values`; refuses an empty required field or a malformed value. */
  text(values: DecoyValues): string;
}

/** How a website address starts: the note beside its field and the words of its refusal. */
const WEBSITE_START = "starting with https: or http:";

const ERRORS = new ErrorCatalog("backup.decoy-qr", {
  kind: () => "Choose a kind of decoy.",
  required: (label: string) => `Fill in the decoy's ${label.toLowerCase()}.`,
  choice: (label: string) => `Choose the decoy's ${label.toLowerCase()} from the list.`,
  control: (label: string) =>
    `The decoy's ${label.toLowerCase()} holds an invisible control character: type it again without it.`,
  surrogate: (label: string) =>
    `The decoy's ${label.toLowerCase()} holds a broken character, half of a pair: type it again.`,
  website: () => `Type the website's whole address, ${WEBSITE_START}.`,
  email: () => "Type the email address as name@domain, without spaces.",
  phone: () => "A phone number holds digits, a + at the start, spaces and - . ( ) only.",
  latitude: () => "The latitude is a number of degrees from -90 to 90, with a dot for decimals.",
  longitude: () =>
    "The longitude is a number of degrees from -180 to 180, with a dot for decimals.",
});

/** vCard lines end in CRLF (RFC 2426 section 4, as MnemoCode's card contact writes them). */
const VCARD_LINE_END = "\r\n";
/** Wi-Fi security, as ZXing's WIFI: text names it; "nopass" is an open network. */
const OPEN_NETWORK = "nopass";
/** The largest latitude and longitude in degrees (RFC 5870 section 3.4.2). */
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

// Code points of the control characters (Unicode's C0 and C1 blocks and its separators).
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const FIRST_PRINTABLE = 0x20;
const DELETE = 0x7f;
/** The last C1 control; NEL, U+0085, is among them. */
const LAST_C1 = 0x9f;
const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;
/** Half of a UTF-16 surrogate pair, which no UTF-8 text and no percent-encoding can hold. */
const LONE_SURROGATE = /\p{Cs}/u;

/**
 * Whether `code` is a control character that `field` does not hold: one of C0 but the line breaks
 * CR and LF, and the tab where the field keeps white space; DEL; one of C1; or a Unicode line or
 * paragraph separator. Each format writes a line break its own way; these it would carry unseen,
 * or a reader would break a line on.
 */
function isControl(code: number, field: DecoyField): boolean {
  return (
    (code < FIRST_PRINTABLE &&
      code !== LINE_FEED &&
      code !== CARRIAGE_RETURN &&
      !(code === TAB && field.tabs === true)) ||
    (code >= DELETE && code <= LAST_C1) ||
    code === LINE_SEPARATOR ||
    code === PARAGRAPH_SEPARATOR
  );
}

/** A field's value as given, empty where it was not; refuses a control or broken character. */
function fieldValue(values: DecoyValues, field: DecoyField): string {
  const value = values[field.name] ?? "";
  if (Array.from(value).some((character) => isControl(character.codePointAt(0) ?? 0, field)))
    throw ERRORS.create("control", [field.label]);
  if (LONE_SURROGATE.test(value)) throw ERRORS.create("surrogate", [field.label]);
  return value;
}

/** A line field's value without the spaces around it; empty where it was not given. */
function lineValue(values: DecoyValues, field: DecoyField): string {
  return fieldValue(values, field).trim();
}

/** `value`, refused when it is empty or only spaces. */
function filled(value: string, field: DecoyField): string {
  if (value.trim() === "") throw ERRORS.create("required", [field.label]);
  return value;
}

/** A required line field's value without the spaces around it. */
function requiredLine(values: DecoyValues, field: DecoyField): string {
  return filled(lineValue(values, field), field);
}

/** Line breaks as one LF each, whichever system typed them. */
function unixLines(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

/** A vCard 3.0 text value: \ ; , and line breaks escaped (RFC 2426 section 4). */
function vcardText(value: string): string {
  return unixLines(value).replace(/[\\;,\n]/gu, (character) =>
    character === "\n" ? "\\n" : `\\${character}`,
  );
}

/** A Wi-Fi value of ZXing's WIFI: text: escaped, and quoted where it reads as hexadecimal. */
function wifiValue(value: string): string {
  const escaped = value.replace(/[\\;,:"]/gu, (character) => `\\${character}`);
  return /^[0-9A-Fa-f]+$/u.test(value) ? `"${escaped}"` : escaped;
}

/** An http or https address as the URL parser writes it; refuses any other. */
function websiteAddress(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw ERRORS.create("website", []);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw ERRORS.create("website", []);
  return url.href;
}

/** An email address of one @ between two nonempty parts, without spaces or control characters. */
function emailAddress(value: string): string {
  if (!/^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+$/u.test(value)) throw ERRORS.create("email", []);
  return value;
}

/** A phone number of digits with an optional leading + and the usual separators. */
function phoneNumber(value: string): string {
  if (!/^\+?[0-9 ().-]+$/u.test(value) || !/[0-9]/u.test(value)) throw ERRORS.create("phone", []);
  return value;
}

/** Decimal degrees within ±`most`, as RFC 5870 writes a number: no + sign, a dot for decimals. */
function degrees(value: string, most: number, code: "latitude" | "longitude"): string {
  if (!/^-?\d{1,3}(?:\.\d+)?$/u.test(value) || Math.abs(Number(value)) > most)
    throw ERRORS.create(code, []);
  return value;
}

const CONTACT_NAME: DecoyField = {
  name: "name",
  label: "Name",
  input: "line",
  required: true,
  tabs: true,
};
const CONTACT_ORGANISATION: DecoyField = {
  name: "organisation",
  label: "Organisation",
  input: "line",
  required: false,
  tabs: true,
};
const CONTACT_TITLE: DecoyField = {
  name: "title",
  label: "Job title",
  input: "line",
  required: false,
  tabs: true,
};
const CONTACT_PHONE: DecoyField = {
  name: "phone",
  label: "Phone",
  input: "line",
  type: "tel",
  required: false,
};
const CONTACT_EMAIL: DecoyField = {
  name: "email",
  label: "Email",
  input: "line",
  type: "email",
  required: false,
};
const CONTACT_WEBSITE: DecoyField = {
  name: "website",
  label: "Website",
  input: "line",
  type: "url",
  required: false,
  note: WEBSITE_START,
};

/**
 * A vCard 3.0 of the contact. RFC 2426 requires N and FN: the one name is FN, and N carries it as
 * the given name, so that a reader that builds the name from N shows it as typed.
 */
function contactText(values: DecoyValues): string {
  const name = vcardText(requiredLine(values, CONTACT_NAME));
  const optional = (tag: string, field: DecoyField, write: (value: string) => string): string[] => {
    const value = lineValue(values, field);
    return value === "" ? [] : [`${tag}:${write(value)}`];
  };
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:;${name};;;`,
    `FN:${name}`,
    ...optional("ORG", CONTACT_ORGANISATION, vcardText),
    ...optional("TITLE", CONTACT_TITLE, vcardText),
    ...optional("TEL", CONTACT_PHONE, phoneNumber),
    ...optional("EMAIL", CONTACT_EMAIL, (value) => vcardText(emailAddress(value))),
    // A URL is a uri value, not text (RFC 2426 section 3.6.8): written as the URL parser writes it.
    ...optional("URL", CONTACT_WEBSITE, websiteAddress),
    "END:VCARD",
  ].join(VCARD_LINE_END);
}

const WEBSITE_ADDRESS: DecoyField = {
  name: "address",
  label: "Website address",
  input: "line",
  type: "url",
  required: true,
  note: WEBSITE_START,
};

const TEXT: DecoyField = {
  name: "text",
  label: "Text",
  input: "lines",
  required: true,
  tabs: true,
};

const WIFI_NAME: DecoyField = {
  name: "ssid",
  label: "Network name",
  input: "line",
  required: true,
};
const WIFI_SECURITY_CHOICES: readonly DecoyChoice[] = [
  { value: "WPA", label: "WPA, WPA2 or WPA3" },
  { value: "WEP", label: "WEP" },
  { value: OPEN_NETWORK, label: "None, an open network" },
];
const WIFI_SECURITY: DecoyField = {
  name: "security",
  label: "Security",
  input: "choice",
  required: true,
  choices: WIFI_SECURITY_CHOICES,
};
const WIFI_PASSWORD: DecoyField = {
  name: "password",
  label: "Password",
  input: "line",
  required: false,
  note: "none for an open network",
};

/**
 * ZXing's WIFI: text of a network. The name and password are taken as typed, spaces included,
 * since a network's name may hold them; an open network has no password.
 */
function wifiText(values: DecoyValues): string {
  const ssid = filled(fieldValue(values, WIFI_NAME), WIFI_NAME);
  const security = fieldValue(values, WIFI_SECURITY);
  if (!WIFI_SECURITY_CHOICES.some((choice) => choice.value === security))
    throw ERRORS.create("choice", [WIFI_SECURITY.label]);
  if (security === OPEN_NETWORK) return `WIFI:T:${OPEN_NETWORK};S:${wifiValue(ssid)};;`;
  const password = filled(fieldValue(values, WIFI_PASSWORD), WIFI_PASSWORD);
  return `WIFI:T:${security};S:${wifiValue(ssid)};P:${wifiValue(password)};;`;
}

const EMAIL_ADDRESS: DecoyField = {
  name: "address",
  label: "Email address",
  input: "line",
  type: "email",
  required: true,
};
const EMAIL_SUBJECT: DecoyField = {
  name: "subject",
  label: "Subject",
  input: "line",
  required: false,
};
const EMAIL_BODY: DecoyField = { name: "body", label: "Message", input: "lines", required: false };

/** A mailto: URI: the address, then the subject and message that are given, percent-encoded. */
function emailText(values: DecoyValues): string {
  const [local = "", domain = ""] = emailAddress(requiredLine(values, EMAIL_ADDRESS)).split("@");
  const query = (
    [
      ["subject", lineValue(values, EMAIL_SUBJECT)],
      // RFC 6068 section 5: a line break of the body is written as CRLF.
      ["body", unixLines(fieldValue(values, EMAIL_BODY)).replaceAll("\n", "\r\n")],
    ] as const
  )
    .filter(([, value]) => value.trim() !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  const to = `${encodeURIComponent(local)}@${encodeURIComponent(domain)}`;
  return query.length === 0 ? `mailto:${to}` : `mailto:${to}?${query.join("&")}`;
}

const PHONE_NUMBER: DecoyField = {
  name: "number",
  label: "Phone number",
  input: "line",
  type: "tel",
  required: true,
};

const LATITUDE: DecoyField = {
  name: "latitude",
  label: "Latitude",
  input: "line",
  required: true,
  note: "-90 to 90",
};
const LONGITUDE: DecoyField = {
  name: "longitude",
  label: "Longitude",
  input: "line",
  required: true,
  note: "-180 to 180",
};

/** Every kind of decoy, in the order a page offers them. */
export const DECOY_KINDS: readonly DecoyKind[] = [
  {
    id: "contact",
    label: "Contact card",
    fields: [
      CONTACT_NAME,
      CONTACT_ORGANISATION,
      CONTACT_TITLE,
      CONTACT_PHONE,
      CONTACT_EMAIL,
      CONTACT_WEBSITE,
    ],
    text: contactText,
  },
  {
    id: "website",
    label: "Website",
    fields: [WEBSITE_ADDRESS],
    text: (values) => websiteAddress(requiredLine(values, WEBSITE_ADDRESS)),
  },
  {
    id: "text",
    label: "Plain text",
    fields: [TEXT],
    text: (values) => filled(fieldValue(values, TEXT), TEXT),
  },
  {
    id: "wifi",
    label: "Wi-Fi network",
    fields: [WIFI_NAME, WIFI_SECURITY, WIFI_PASSWORD],
    text: wifiText,
  },
  {
    id: "email",
    label: "Email",
    fields: [EMAIL_ADDRESS, EMAIL_SUBJECT, EMAIL_BODY],
    text: emailText,
  },
  {
    id: "phone",
    label: "Phone number",
    fields: [PHONE_NUMBER],
    // RFC 3966 knows the separators - . ( ) and no spaces.
    text: (values) => `tel:${phoneNumber(requiredLine(values, PHONE_NUMBER)).replaceAll(" ", "")}`,
  },
  {
    id: "location",
    label: "Location",
    fields: [LATITUDE, LONGITUDE],
    text: (values) =>
      `geo:${degrees(requiredLine(values, LATITUDE), MAX_LATITUDE, "latitude")},` +
      degrees(requiredLine(values, LONGITUDE), MAX_LONGITUDE, "longitude"),
  },
];

/** The kind of decoy `id` names; refuses any other (code backup.decoy-qr.kind). */
export function decoyKind(id: string): DecoyKind {
  const kind = DECOY_KINDS.find((candidate) => candidate.id === id);
  if (kind === undefined) throw ERRORS.create("kind", []);
  return kind;
}
