const html = require('choo/html');
const raw = require('choo/html/raw');
const { list, bytes, timeLeft } = require('../utils');
const archiveTile = require('./archiveTile');
const modal = require('./modal');
const intro = require('./intro');
const assets = require('../../common/assets');

module.exports = function(state, emit) {
  const isLocalUser = state.user && state.user.isLocalAuth && state.user.loggedIn;

  let left = '';
  if (state.uploading) {
    left = archiveTile.uploading(state, emit);
  } else if (state.archive.numFiles > 0) {
    left = archiveTile.wip(state, emit);
  } else {
    left = archiveTile.empty(state, emit);
  }

  let right;
  if (isLocalUser) {
    right = renderMyUploads(state, emit);
  } else {
    const archives = state.storage.files
      .filter(archive => !archive.expired)
      .map(archive => archiveTile(state, emit, archive));

    if (archives.length > 0 && state.WEB_UI.UPLOADS_LIST_NOTICE_HTML) {
      archives.push(html`
        <p
          class="w-full p-2 border-default dark:border-grey-70 rounded-default text-orange-60 bg-yellow-40 text-center leading-normal"
        >
          ${raw(state.WEB_UI.UPLOADS_LIST_NOTICE_HTML)}
        </p>
      `);
    }

    archives.reverse();

    if (archives.length > 0 && state.WEB_UI.SHOW_THUNDERBIRD_SPONSOR) {
      archives.push(html`
        <a
          class="w-full p-2 border-default dark:border-grey-70 rounded-default text-orange-60 bg-yellow-40 text-center leading-normal d-block"
          href="https://www.thunderbird.net/"
        >
          <svg
            width="30"
            height="30"
            class="m-2 mr-3 d-inline-block align-middle"
          >
            <image
              xlink:href="${assets.get('thunderbird-icon.svg')}"
              src="${assets.get('thunderbird-icon.svg')}"
              width="30"
              height="30"
            />
          </svg>
          Sponsored by Thunderbird
        </a>
      `);
    }

    right =
      archives.length === 0
        ? intro(state)
        : list(archives, 'p-2 h-full overflow-y-auto w-full', 'mb-4 w-full');
  }

  const rightPanelClass = isLocalUser
    ? 'mt-6 w-full md:w-1/2 md:-m-2 overflow-y-auto'
    : 'mt-6 w-full md:w-1/2 md:-m-2';

  return html`
    <main class="main">
      ${state.modal && modal(state, emit)}
      <section
        class="h-full w-full p-6 md:p-8 overflow-hidden md:flex md:flex-row md:rounded-xl md:shadow-big"
      >
        <div class="px-2 w-full md:px-0 md:mr-8 md:w-1/2">${left}</div>
        <div class="${rightPanelClass}">${right}</div>
      </section>
      <p class="text-center text-grey-40 dark:text-grey-60 text-xs mt-2 pb-1 select-none">
        v${state.buildVersion || '?'}
      </p>
    </main>
  `;
};

function renderMyUploads(state, emit) {
  const uploads = state.myUploads || [];

  if (uploads.length === 0) {
    return html`
      <div class="flex flex-col items-center justify-center h-full text-grey-60 dark:text-grey-40 text-sm">
        <svg class="h-8 w-6 mb-3 opacity-40">
          <use xlink:href="${assets.get('blue_file.svg')}#icon" />
        </svg>
        <p class="font-medium">My Uploads</p>
        <p class="mt-1 opacity-75">Files you upload will appear here.</p>
      </div>
    `;
  }

  const rows = uploads.map(u => {
    const displayName = u.name || (u.id ? u.id.slice(0, 12) + '...' : '—');
    const sizeText = u.size ? bytes(u.size) : '';
    const expiryText = u.alive && u.ttlMs > 0
      ? (() => {
          const l10n = timeLeft(u.ttlMs);
          const remaining = l10n.minutes != null
            ? `${l10n.minutes}m`
            : l10n.hours != null
              ? `${l10n.hours}h`
              : l10n.days != null
                ? `${l10n.days}d`
                : '';
          return `${u.dlimit - u.dl} download${(u.dlimit - u.dl) !== 1 ? 's' : ''} or ${remaining} remaining`;
        })()
      : 'Expired';

    return html`
      <li class="mb-4 w-full">
        <send-archive
          id="myupload-${u.id}"
          class="flex flex-col items-start rounded-default shadow-light bg-white p-4 w-full dark:bg-grey-90 dark:border-default dark:border-grey-70"
        >
          <p class="w-full flex items-center">
            <svg class="h-8 w-6 mr-3 flex-shrink-0 text-primary">
              <use xlink:href="${assets.get('blue_file.svg')}#icon" />
            </svg>
            <span class="flex-grow min-w-0">
              <span class="block text-base font-medium break-all">${displayName}</span>
              <span class="block text-sm font-normal opacity-75 pt-1">${sizeText}</span>
            </span>
            <input
              type="image"
              class="self-start flex-shrink-0 text-white hover:opacity-75 focus:outline ml-2"
              alt="Delete"
              title="Delete"
              src="${assets.get('close-16.svg')}"
              onclick=${e => { e.stopPropagation(); emit('delete-my-upload', u.id); }}
            />
          </p>
          <div class="text-sm opacity-75 w-full mt-2 mb-2">${expiryText}</div>
          <hr class="w-full border-t my-2 dark:border-grey-70" />
          <div class="flex justify-between w-full">
            ${u.alive && u.downloadUrl ? html`
              <a
                class="flex items-baseline link-primary"
                href="${u.downloadUrl}"
                title="Download"
                tabindex="0"
                target="_blank"
              >
                <svg class="h-4 w-3 mr-2">
                  <use xlink:href="${assets.get('dl.svg')}#icon" />
                </svg>
                Download
              </a>
            ` : html`<div></div>`}
            ${u.alive && u.downloadUrl ? html`
              <button
                class="link-primary focus:outline self-end flex items-center"
                title="Copy link"
                onclick=${e => {
                  e.stopPropagation();
                  navigator.clipboard
                    .writeText(window.location.origin + u.downloadUrl)
                    .catch(() => {});
                  const t = e.currentTarget.lastChild;
                  t.textContent = 'Copied!';
                  setTimeout(() => (t.textContent = 'Copy link'), 1000);
                }}
              >
                <svg class="h-4 w-4 mr-2">
                  <use xlink:href="${assets.get('copy-16.svg')}#icon" />
                </svg>
                Copy link
              </button>
            ` : html`<span class="text-sm opacity-50">${expiryText === 'Expired' ? 'Expired' : ''}</span>`}
          </div>
        </send-archive>
      </li>
    `;
  });

  return html`
    <div class="flex flex-col h-full">
      <p class="text-sm font-medium opacity-75 mb-3 flex-shrink-0">My Uploads</p>
      <ul class="overflow-y-auto flex-1 w-full">${rows}</ul>
    </div>
  `;
}
