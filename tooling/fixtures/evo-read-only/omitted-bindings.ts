const [, , suffix, key] = match;
const [, { safe }] = values;
sdk.tokens.transfer({ suffix, key, safe });
