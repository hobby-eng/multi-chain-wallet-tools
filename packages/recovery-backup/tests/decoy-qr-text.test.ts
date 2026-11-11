import { describe, expect, it } from "vitest";
import { DECOY_KINDS, decoyKind, type DecoyValues } from "../src/decoy-qr-text.js";

// Synthetic decoys only: names made up, domains reserved for examples (RFC 2606), a London number
// that Ofcom keeps for drama and a North American 555-01xx number kept for fiction. Every expected
// text is written by hand from its format's rules, never by the builder.
const text = (kind: string, values: DecoyValues): string => decoyKind(kind).text(values);

/** The code of what `run` throws. */
function refusal(run: () => unknown): string | undefined {
  try {
    run();
  } catch (cause) {
    return cause instanceof Error && "code" in cause ? String(cause.code) : String(cause);
  }
  return undefined;
}

describe("decoy kinds", () => {
  it("offers the seven ordinary QR contents in the page's order", () => {
    expect(DECOY_KINDS.map(({ id, label }) => [id, label])).toEqual([
      ["contact", "Contact card"],
      ["website", "Website"],
      ["text", "Plain text"],
      ["wifi", "Wi-Fi network"],
      ["email", "Email"],
      ["phone", "Phone number"],
      ["location", "Location"],
    ]);
  });

  it("refuses a kind that it does not know", () => {
    expect(refusal(() => decoyKind("bitmap"))).toBe("backup.decoy-qr.kind");
  });
});

describe("contact card (vCard 3.0)", () => {
  it("escapes backslash, semicolon, comma and line breaks in text values, and keeps a colon", () => {
    expect(
      text("contact", {
        name: "  Ana Ruiz  ",
        organisation: "Ruiz, Cole & Partners; Ltd",
        title: "Head\\Of: Design\r\nand Print\rStudio\nLead",
        phone: "+44 20 7946 0000",
        email: "ana@ruiz.example",
        website: "https://ruiz.example/a,b;c",
      }),
    ).toBe(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "N:;Ana Ruiz;;;",
        "FN:Ana Ruiz",
        "ORG:Ruiz\\, Cole & Partners\\; Ltd",
        "TITLE:Head\\\\Of: Design\\nand Print\\nStudio\\nLead",
        "TEL:+44 20 7946 0000",
        "EMAIL:ana@ruiz.example",
        "URL:https://ruiz.example/a,b;c",
        "END:VCARD",
      ].join("\r\n"),
    );
  });

  it("writes only the fields given, with unfolded lines however long", () => {
    const long = "A".repeat(120);
    expect(text("contact", { name: long, title: "" })).toBe(
      `BEGIN:VCARD\r\nVERSION:3.0\r\nN:;${long};;;\r\nFN:${long}\r\nEND:VCARD`,
    );
  });

  it("escapes a name in N and FN alike", () => {
    expect(text("contact", { name: "Rivers; Sam, Jr." })).toBe(
      "BEGIN:VCARD\r\nVERSION:3.0\r\nN:;Rivers\\; Sam\\, Jr.;;;\r\nFN:Rivers\\; Sam\\, Jr.\r\nEND:VCARD",
    );
  });

  it("refuses a contact without a name and malformed phone, email or website", () => {
    expect(refusal(() => text("contact", { name: " ", phone: "+1 555 0100" }))).toBe(
      "backup.decoy-qr.required",
    );
    expect(refusal(() => text("contact", { name: "Ana", phone: "555-CALL" }))).toBe(
      "backup.decoy-qr.phone",
    );
    expect(refusal(() => text("contact", { name: "Ana", email: "ana at ruiz.example" }))).toBe(
      "backup.decoy-qr.email",
    );
    expect(refusal(() => text("contact", { name: "Ana", website: "ruiz.example" }))).toBe(
      "backup.decoy-qr.website",
    );
  });

  it("says which field is empty", () => {
    expect(() => text("contact", {})).toThrow("Fill in the decoy's name.");
  });
});

describe("website", () => {
  it("writes an http or https address as the URL parser writes it", () => {
    expect(text("website", { address: " https://shop.example/a?b=1&c=2#top " })).toBe(
      "https://shop.example/a?b=1&c=2#top",
    );
    expect(text("website", { address: "HTTP://Shop.Example" })).toBe("http://shop.example/");
    expect(text("website", { address: "https://shop.example/a b" })).toBe(
      "https://shop.example/a%20b",
    );
  });

  it("refuses an address without its scheme or with another scheme", () => {
    for (const address of ["shop.example", "ftp://shop.example/", "javascript:void(0)"])
      expect(refusal(() => text("website", { address }))).toBe("backup.decoy-qr.website");
    expect(refusal(() => text("website", { address: "" }))).toBe("backup.decoy-qr.required");
  });
});

describe("plain text", () => {
  it("keeps the text exactly as typed, special characters and line breaks included", () => {
    const typed = " Line one;\r\nLine two: a, b \\ c\n";
    expect(text("text", { text: typed })).toBe(typed);
  });

  it("refuses a text of spaces and line breaks only", () => {
    expect(refusal(() => text("text", { text: " \r\n \n" }))).toBe("backup.decoy-qr.required");
  });
});

describe("Wi-Fi network (WIFI:)", () => {
  it("escapes backslash, semicolon, comma, colon and double quote", () => {
    expect(
      text("wifi", { ssid: 'Home "Net"; 5G', security: "WPA", password: "pa:ss,word\\1" }),
    ).toBe('WIFI:T:WPA;S:Home \\"Net\\"\\; 5G;P:pa\\:ss\\,word\\\\1;;');
  });

  it("quotes a name or password that could be read as hexadecimal", () => {
    expect(text("wifi", { ssid: "CAFE", security: "WEP", password: "0123456789" })).toBe(
      'WIFI:T:WEP;S:"CAFE";P:"0123456789";;',
    );
    expect(text("wifi", { ssid: "CAFE 2", security: "WPA", password: "0123456789x" })).toBe(
      "WIFI:T:WPA;S:CAFE 2;P:0123456789x;;",
    );
  });

  it("keeps the spaces of a network's name and writes no password for an open network", () => {
    expect(text("wifi", { ssid: " Lab ", security: "nopass", password: "unused" })).toBe(
      "WIFI:T:nopass;S: Lab ;;",
    );
  });

  it("refuses a missing name or password and a security it does not offer", () => {
    expect(refusal(() => text("wifi", { ssid: "", security: "WPA", password: "x" }))).toBe(
      "backup.decoy-qr.required",
    );
    expect(() => text("wifi", { ssid: "Lab", security: "WPA" })).toThrow(
      "Fill in the decoy's password.",
    );
    expect(refusal(() => text("wifi", { ssid: "Lab", security: "WPA4", password: "x" }))).toBe(
      "backup.decoy-qr.choice",
    );
  });
});

describe("email (mailto:)", () => {
  it("percent-encodes the subject and the message, with line breaks as CRLF", () => {
    expect(
      text("email", {
        address: "ana@ruiz.example",
        subject: "Hello & welcome? 100%",
        body: "Line 1\nLine 2#; a:b,c",
      }),
    ).toBe(
      "mailto:ana@ruiz.example?subject=Hello%20%26%20welcome%3F%20100%25&body=Line%201%0D%0ALine%202%23%3B%20a%3Ab%2Cc",
    );
  });

  it("writes the address alone when nothing else is given, its parts percent-encoded", () => {
    expect(text("email", { address: "ana@ruiz.example", body: " \n" })).toBe(
      "mailto:ana@ruiz.example",
    );
    expect(text("email", { address: "ana+qr@ruiz.example", subject: "Hi" })).toBe(
      "mailto:ana%2Bqr@ruiz.example?subject=Hi",
    );
  });

  it("refuses an address that is not name@domain", () => {
    for (const address of ["ana@", "@ruiz.example", "ana ruiz@ruiz.example", "a@b@c"])
      expect(refusal(() => text("email", { address }))).toBe("backup.decoy-qr.email");
  });
});

describe("phone number (tel:)", () => {
  it("keeps the digits, a leading + and the separators - . ( ), and leaves the spaces out", () => {
    expect(text("phone", { number: " +1 (555) 010-0199 " })).toBe("tel:+1(555)010-0199");
    expect(text("phone", { number: "555.0100" })).toBe("tel:555.0100");
  });

  it("refuses letters, a + inside the number and a number without digits", () => {
    for (const number of ["555-CALL", "1+2", "+", "(-)", "555;0100"])
      expect(refusal(() => text("phone", { number }))).toBe("backup.decoy-qr.phone");
  });
});

describe("characters that no decoy field holds", () => {
  // Every field of every kind filled in well, so that only the one bad character is refused.
  const VALID: Readonly<Record<string, DecoyValues>> = {
    contact: {
      name: "Ana",
      organisation: "Studio",
      title: "Lead",
      phone: "+1 555 0100",
      email: "ana@ruiz.example",
      website: "https://shop.example/",
    },
    website: { address: "https://shop.example/" },
    text: { text: "Text" },
    wifi: { ssid: "Lab", security: "WPA", password: "pass" },
    email: { address: "ana@ruiz.example", subject: "Hi", body: "Body" },
    phone: { number: "+1 555 0100" },
    location: { latitude: "0", longitude: "0" },
  };
  const filledWith = (kind: string, name: string, bad: string): DecoyValues => ({
    ...VALID[kind],
    [name]: `${VALID[kind]?.[name] ?? ""}${bad}`,
  });

  it("takes every field filled in well", () => {
    for (const kind of DECOY_KINDS) {
      expect(Object.keys(VALID[kind.id] ?? {})).toEqual(kind.fields.map((field) => field.name));
      expect(() => kind.text(VALID[kind.id] ?? {})).not.toThrow();
    }
  });

  it("refuses C0 controls but CR and LF, DEL, C1 controls and the Unicode separators everywhere", () => {
    const controls = ["\u0000", "\u000B", "\u001B", "\u007F", "\u0085", "\u009F"];
    for (const bad of [...controls, "\u2028", "\u2029"])
      for (const kind of DECOY_KINDS)
        for (const field of kind.fields)
          expect(refusal(() => kind.text(filledWith(kind.id, field.name, bad)))).toBe(
            "backup.decoy-qr.control",
          );
  });

  it("takes a tab in a plain text and the vCard text values only, and refuses it elsewhere", () => {
    const keepsTabs = ["contact.name", "contact.organisation", "contact.title", "text.text"];
    for (const kind of DECOY_KINDS)
      for (const field of kind.fields) {
        const values = filledWith(kind.id, field.name, "\tTabbed");
        if (keepsTabs.includes(`${kind.id}.${field.name}`))
          expect(kind.text(values)).toContain("\tTabbed");
        else expect(refusal(() => kind.text(values))).toBe("backup.decoy-qr.control");
      }
    expect(text("text", { text: "a\tb" })).toBe("a\tb");
    expect(text("contact", { name: "Ana\tRuiz" })).toBe(
      "BEGIN:VCARD\r\nVERSION:3.0\r\nN:;Ana\tRuiz;;;\r\nFN:Ana\tRuiz\r\nEND:VCARD",
    );
  });

  it("refuses half of a surrogate pair everywhere, and takes a whole pair", () => {
    for (const bad of ["\uD800", "\uDFFF", "a\uDC00b"])
      for (const kind of DECOY_KINDS)
        for (const field of kind.fields)
          expect(refusal(() => kind.text(filledWith(kind.id, field.name, bad)))).toBe(
            "backup.decoy-qr.surrogate",
          );
    expect(text("text", { text: "Seeds 🌱" })).toBe("Seeds 🌱");
    expect(text("email", { address: "ana@ruiz.example", subject: "🌱" })).toBe(
      "mailto:ana@ruiz.example?subject=%F0%9F%8C%B1",
    );
  });

  it("names the field without repeating what was typed", () => {
    expect(() => text("contact", { name: "Ana", title: "Lead\u0007" })).toThrow(
      "The decoy's job title holds an invisible control character: type it again without it.",
    );
    expect(() => text("email", { address: "ana@ruiz.example", body: "\uD800" })).toThrow(
      "The decoy's message holds a broken character, half of a pair: type it again.",
    );
  });
});

describe("location (geo:)", () => {
  it("writes decimal degrees as typed", () => {
    expect(text("location", { latitude: "48.8584", longitude: "-2.2945" })).toBe(
      "geo:48.8584,-2.2945",
    );
    expect(text("location", { latitude: "-90", longitude: "180" })).toBe("geo:-90,180");
  });

  it("refuses degrees out of range, a + sign, a decimal comma and an empty field", () => {
    expect(refusal(() => text("location", { latitude: "90.1", longitude: "0" }))).toBe(
      "backup.decoy-qr.latitude",
    );
    for (const longitude of ["-180.5", "+10", "10,5", "1e2"])
      expect(refusal(() => text("location", { latitude: "0", longitude }))).toBe(
        "backup.decoy-qr.longitude",
      );
    expect(refusal(() => text("location", { latitude: "0" }))).toBe("backup.decoy-qr.required");
  });
});
