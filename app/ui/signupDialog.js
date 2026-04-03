const html = require('choo/html');
const assets = require('../../common/assets');
const { bytes } = require('../utils');

module.exports = function() {
  return function(state, emit, close) {
    const DAYS = Math.floor(state.LIMITS.MAX_EXPIRE_SECONDS / 86400);
    const isLocal = state.user && state.user.isLocalAuth;

    if (isLocal) {
      return renderLocalForm(state, emit, close, DAYS);
    }
    return renderFxaForm(state, emit, close, DAYS);
  };
};

function renderLocalForm(state, emit, close, DAYS) {
  let mode = 'signin'; // 'signin' | 'register'
  let error = null;
  let submitting = false;

  function rebuild() {
    // force choo to re-render by emitting render
    emit('render');
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    const email = document.getElementById('local-email').value.trim();
    const password = document.getElementById('local-password').value;
    const name = mode === 'register'
      ? (document.getElementById('local-name') || {}).value
      : undefined;

    if (!email || !password) {
      error = 'Email and password are required.';
      return rebuild();
    }

    submitting = true;
    error = null;
    rebuild();

    emit('login-local', { email, password, name, mode });
  }

  function switchMode(newMode, event) {
    event.preventDefault();
    mode = newMode;
    error = null;
    rebuild();
  }

  return html`
    <send-signup-dialog
      class="flex flex-col justify-center my-16 md:my-0 px-8 md:px-24 w-full h-full"
    >
      <img src="${assets.get('master-logo.svg')}" class="h-16 mt-1 mb-4" />
      <section class="flex flex-col flex-grow m-4 md:self-center md:w-128">
        <div class="flex border-b border-grey-30 mb-4">
          <button
            class="flex-1 py-2 text-center font-medium ${mode === 'signin' ? 'border-b-2 border-primary text-primary' : 'text-grey-50'}"
            onclick=${e => switchMode('signin', e)}
          >
            Sign In
          </button>
          <button
            class="flex-1 py-2 text-center font-medium ${mode === 'register' ? 'border-b-2 border-primary text-primary' : 'text-grey-50'}"
            onclick=${e => switchMode('register', e)}
          >
            Register
          </button>
        </div>

        <form onsubmit=${handleSubmit} data-no-csrf>
          ${mode === 'register' ? html`
            <input
              id="local-name"
              type="text"
              class="border-default rounded-lg w-full px-2 py-1 h-12 mb-3 text-lg text-grey-70 leading-loose dark:bg-grey-80 dark:text-white"
              placeholder="Display name (optional)"
              autocomplete="name"
            />
          ` : ''}
          <input
            id="local-email"
            type="email"
            class="border-default rounded-lg w-full px-2 py-1 h-12 mb-3 text-lg text-grey-70 leading-loose dark:bg-grey-80 dark:text-white"
            placeholder="Email address"
            autocomplete="email"
            required
          />
          <input
            id="local-password"
            type="password"
            class="border-default rounded-lg w-full px-2 py-1 h-12 mb-3 text-lg text-grey-70 leading-loose dark:bg-grey-80 dark:text-white"
            placeholder="${mode === 'register' ? 'Password (min 8 characters)' : 'Password'}"
            autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}"
            required
          />
          ${(error || state.loginError) ? html`<p class="text-red-500 text-sm mb-2">${error || state.loginError}</p>` : ''}
          <input
            class="btn rounded-lg w-full flex flex-shrink-0 items-center justify-center"
            value="${submitting ? 'Please wait...' : (mode === 'signin' ? 'Sign In' : 'Create Account')}"
            type="submit"
            disabled="${submitting}"
          />
        </form>

        ${state.user.loginRequired
          ? ''
          : html`
              <button
                class="my-3 link-primary font-medium"
                onclick=${close}
              >
                ${state.translate('deletePopupCancel')}
              </button>
            `}
      </section>
    </send-signup-dialog>
  `;
}

function renderFxaForm(state, emit, close, DAYS) {
  let submitting = false;

  function emailish(str) {
    if (!str) return false;
    const a = str.split('@');
    return a.length === 2 && a.every(s => s.length > 0);
  }

  function submitEmail(event) {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    const el = document.getElementById('email-input');
    const email = el.value;
    emit('login', emailish(email) ? email : null);
  }

  return html`
    <send-signup-dialog
      class="flex flex-col justify-center my-16 md:my-0 px-8 md:px-24 w-full h-full"
    >
      <img src="${assets.get('master-logo.svg')}" class="h-16 mt-1 mb-4" />
      <section class="flex flex-col flex-shrink-0 self-center">
        <h1 class="text-3xl font-bold text-center">
          ${state.translate('accountBenefitTitle')}
        </h1>
        <ul
          class="leading-normal list-disc text-grey-80 my-2 mt-4 pl-4 md:self-center dark:text-grey-40"
        >
          <li>
            ${state.translate('accountBenefitLargeFiles', {
              size: bytes(state.LIMITS.MAX_FILE_SIZE)
            })}
          </li>
          <li>${state.translate('accountBenefitDownloadCount')}</li>
          <li>
            ${state.translate('accountBenefitTimeLimit', { count: DAYS })}
          </li>
          <li>${state.translate('accountBenefitSync')}</li>
        </ul>
      </section>
      <section class="flex flex-col flex-grow m-4 md:self-center md:w-128">
        <form onsubmit=${submitEmail} data-no-csrf>
          <input
            id="email-input"
            type="email"
            class="hidden border-default rounded-lg w-full px-2 py-1 h-12 mb-3 text-lg text-grey-70 leading-loose dark:bg-grey-80 dark:text-white"
            placeholder=${state.translate('emailPlaceholder')}
          />
          <input
            class="btn rounded-lg w-full flex flex-shrink-0 items-center justify-center"
            value="${state.translate('signInOnlyButton')}"
            title="${state.translate('signInOnlyButton')}"
            id="email-submit"
            type="submit"
          />
        </form>
        ${state.user.loginRequired
          ? ''
          : html`
              <button
                class="my-3 link-primary font-medium"
                title="${state.translate('deletePopupCancel')}"
                onclick=${close}
              >
                ${state.translate('deletePopupCancel')}
              </button>
            `}
      </section>
    </send-signup-dialog>
  `;
}
