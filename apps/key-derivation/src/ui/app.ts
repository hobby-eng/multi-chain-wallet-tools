import * as registry from '@ckd/coins/registry.js';
import { detectMultiChainMatcherTargets } from '@ckd/recovery/matcher-targets-multichain.js';
import { startKeyDerivationApp } from './app-bootstrap.js';

startKeyDerivationApp(registry, detectMultiChainMatcherTargets);
