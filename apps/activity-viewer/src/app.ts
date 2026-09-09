import { startActivityViewer } from './start.js';
import { installMultiChainActivity } from './multichain-activity.js';

const view = startActivityViewer();
installMultiChainActivity(document, view);
