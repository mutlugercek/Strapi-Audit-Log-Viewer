// Server-side plugin entry point

import bootstrap from './bootstrap';
import routes from './routes';
import controllers from './controllers';
import services from './services';
import policies from './policies';

export default {
  bootstrap,
  routes,
  controllers,
  services,
  policies,
};

