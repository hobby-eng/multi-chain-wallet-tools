import { SelfTestVerifier } from "./self-test-check.mjs";
import { StartupSelfTestCatalog } from "../../../tooling/startup-self-test-catalog.mjs";

await new SelfTestVerifier(StartupSelfTestCatalog.multiChain).verify();
