import { startActivityViewer } from './start.js';
import { installExternalActivity } from './external-activity.js';
import { SELECTED_EXTERNAL_ACTIVITY_ADAPTERS } from './activity-feature-selection.js';

const view = startActivityViewer();
installExternalActivity(document, view, SELECTED_EXTERNAL_ACTIVITY_ADAPTERS);
