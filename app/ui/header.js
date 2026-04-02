const html = require('choo/html');
const Component = require('choo/component');
const Account = require('./account');
const assets = require('../../common/assets');
const { platform } = require('../utils');

class Header extends Component {
  constructor(name, state, emit) {
    super(name);
    this.state = state;
    this.emit = emit;
    this.account = state.cache(Account, 'account');
  }

  update() {
    this.account.render();
    return false;
  }

  createElement() {
    let assetMap = {};
    if (this.state.ui !== undefined) assetMap = this.state.ui.assets;
    else
      assetMap = {
        icon:
          this.state.WEB_UI.CUSTOM_ASSETS.icon !== ''
            ? this.state.WEB_UI.CUSTOM_ASSETS.icon
            : assets.get('icon.svg'),
        wordmark:
          this.state.WEB_UI.CUSTOM_ASSETS.wordmark !== ''
            ? this.state.WEB_UI.CUSTOM_ASSETS.wordmark
            : assets.get('wordmark.svg') + '#logo'
      };
    const title =
      platform() === 'android'
        ? html`
            <a class="flex flex-row items-center">
              <img src="${assetMap.icon}" />
              <svg class="w-48">
                <use xlink:href="${assetMap.wordmark}" />
              </svg>
            </a>
          `
        : html`
            <a class="flex flex-row items-center" href="/">
              <img
                alt="${this.state.translate('title')}"
                src="${assetMap.icon}"
              />
              <svg viewBox="66 0 340 64" class="w-48 md:w-64">
                <use xlink:href="${assetMap.wordmark}" />
              </svg>
            </a>
          `;

    const darkToggle = html`
      <button
        class="dark-mode-toggle ml-2 p-2 rounded-full text-grey-50 hover:text-primary focus:outline transition-colors"
        title="Toggle dark / light mode"
        aria-label="Toggle dark / light mode"
        onclick=${() => {
          const html = document.documentElement;
          const isDark = html.classList.toggle('dark');
          try {
            localStorage.setItem('colorScheme', isDark ? 'dark' : 'light');
          } catch (e) {}
        }}
      >
        <!-- Moon: shown in light mode -->
        <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        <!-- Sun: shown in dark mode -->
        <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      </button>
    `;

    return html`
      <header
        class="main-header relative flex-none flex flex-row items-center justify-between w-full px-6 md:px-8 h-16 md:h-24 z-20 bg-transparent"
      >
        ${title}
        <div class="flex flex-row items-center">
          ${darkToggle} ${this.account.render()}
        </div>
      </header>
    `;
  }
}

module.exports = Header;
