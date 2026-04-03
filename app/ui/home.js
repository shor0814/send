const html = require('choo/html');
const raw = require('choo/html/raw');
const { list, bytes } = require('../utils');
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

function formatTtl(ttlMs) {
  if (!ttlMs || ttlMs <= 0) return 'Expired';
  const hours = Math.floor(ttlMs / 3600000);
  if (hours < 1) return 'Less than 1h remaining';
  if (hours < 24) return `${hours}h remaining`;
  return `${Math.floor(hours / 24)}d remaining`;
}

function getSecretKey(sendFileId) {
  try {
    const keys = JSON.parse(localStorage.getItem('sendFileKeys') || '{}');
    return keys[sendFileId] || null;
  } catch (e) {
    return null;
  }
}

function renderMyUploads(state, emit) {
  const uploads = state.myUploads || [];

  if (uploads.length === 0) {
    return html`
      <div class="flex flex-col items-center justify-center h-full text-grey-50 dark:text-grey-40 text-sm p-4">
        <p class="font-semibold mb-1">My Uploads</p>
        <p>No uploads yet. Files you upload will appear here.</p>
      </div>
    `;
  }

  const rows = uploads.map(u => {
    const secretKey = getSecretKey(u.id);
    const downloadUrl = u.alive && secretKey ? `/download/${u.id}/#${secretKey}` : null;
    const displayName = u.name || (u.id ? u.id.slice(0, 12) + '...' : '—');
    const sizeText = u.size ? bytes(u.size) : '';
    const statusText = u.alive
      ? `${u.dl}/${u.dlimit} downloads · ${formatTtl(u.ttlMs)}`
      : 'Expired';

    return html`
      <li class="mb-4 w-full rounded-lg border border-grey-20 dark:border-grey-70 bg-white dark:bg-grey-90 p-3 text-sm">
        <div class="flex items-start justify-between">
          <div class="min-w-0 mr-2">
            <p class="font-medium truncate text-grey-80 dark:text-grey-10" title="${u.name || u.id}">${displayName}</p>
            <p class="text-grey-50 dark:text-grey-40 text-xs mt-0.5">${sizeText}${sizeText ? ' · ' : ''}${statusText}</p>
          </div>
          <button
            onclick=${() => emit('delete-my-upload', u.id)}
            class="flex-shrink-0 text-grey-40 hover:text-red-60 transition-colors ml-1 mt-0.5"
            title="Delete"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14H6L5 6"></path>
              <path d="M10 11v6M14 11v6"></path>
              <path d="M9 6V4h6v2"></path>
            </svg>
          </button>
        </div>
        ${u.alive && downloadUrl ? html`
          <div class="flex gap-3 mt-2">
            <a href="${downloadUrl}" class="text-xs text-blue-60 hover:underline" target="_blank">Download</a>
            <button
              class="text-xs text-blue-60 hover:underline"
              onclick=${() => {
                navigator.clipboard
                  .writeText(window.location.origin + downloadUrl)
                  .catch(() => {});
              }}
            >Copy link</button>
          </div>
        ` : ''}
      </li>
    `;
  });

  return html`
    <div class="flex flex-col h-full">
      <h2 class="text-xs font-semibold text-grey-60 dark:text-grey-40 uppercase tracking-wide mb-3 flex-shrink-0">
        My Uploads
      </h2>
      <ul class="overflow-y-auto flex-1 w-full pr-1">${rows}</ul>
    </div>
  `;
}
