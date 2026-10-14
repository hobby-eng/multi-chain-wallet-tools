// Every control that derives, signs or encrypts from the phrase asks the cryptographic self-tests'
// verdict before it starts: a failed startup or full self-test keeps them all closed, so a build
// whose known answers came out wrong hands out no key, child phrase or address.

/** What a control says when it is pressed before the self-tests have passed. */
export const SELF_TEST_NOT_PASSED =
  "Cryptographic self-test has not completed successfully. Derivation is blocked.";
