import * as registry from '@ckd/coins/registry.js';
import { startKeyDerivationApp } from './app-bootstrap.js';
import { createBitcoinAddressSearchRunner } from './address-search-feature.js';

startKeyDerivationApp(registry, createBitcoinAddressSearchRunner());
