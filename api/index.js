import { validateConfig } from '../backend/src/config.js';
import { createApp } from '../backend/src/app.js';

validateConfig();

export default createApp();
