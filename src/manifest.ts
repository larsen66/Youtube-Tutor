import type { Manifest } from 'webextension-polyfill';
import pkg from '../package.json';

const manifest: Manifest.WebExtensionManifest = {
  manifest_version: 3,
  name: pkg.displayName,
  version: pkg.version,
  description: pkg.description,
  options_ui: {
    page: 'src/pages/options/index.html',
  },
  background: {
    service_worker: 'src/pages/background/index.js',
    type: 'module',
  },
  action: {
    default_popup: 'src/pages/popup/index.html',
    default_icon: 'icon-34.png',
  },
  // rewrite newtab content to custom page
  // chrome_url_overrides: {
  //   newtab: 'src/pages/newtab/index.html',
  // },
  devtools_page: 'src/pages/devtools/index.html',
  // @ts-ignore
  side_panel: {
    default_path: "src/pages/panel/index.html",
  },
  icons: {
    '128': 'icon-128.png',
  },
  permissions: ["activeTab", "sidePanel", "tabs", "declarativeNetRequest"],
  host_permissions: [
    "https://*.youtube.com/*"
  ],
  // Ensure YouTube API requests look like they originate from youtube.com
  // so youtube-caption-extractor can work in the browser extension context
  // by rewriting request headers via Declarative Net Request.
  // Static rules file is placed under /public and copied to dist.
  declarative_net_request: {
    rule_resources: [
      {
        id: "request_header_rules",
        enabled: true,
        path: "rules/request_headers.json",
      },
    ],
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*', '<all_urls>'],
      js: ['src/pages/content/index.js'],
      css: ['contentStyle.css'],
    },
  ],
  web_accessible_resources: [
    {
      resources: ['contentStyle.css', 'icon-128.png', 'icon-34.png'],
      matches: [],
    },
  ],
};

export default manifest;
