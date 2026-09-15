import * as registry from '@ckd/coins/dash-registry.js';
import { detectDashMatcherTargets } from '@ckd/recovery/matcher-targets-dash.js';
import { startKeyDerivationApp } from './app-bootstrap.js';

startKeyDerivationApp(registry, detectDashMatcherTargets);
