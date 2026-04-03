const html = require('choo/html');
const raw = require('choo/html/raw');
const { list, bytes } = require('../utils');
const archiveTile = require('./archiveTile');
const modal = require('./modal');
const intro = require('./intro');
const assets = require('../../common/assets');

module.exports = function(state, emit) {
  const archives = state.storage.files
    .filter(archive => !archive.expired)
    .map(archive => archiveTile(state, emit, archive));
  let left = '';
  if (state.uploading) {
    left = archiveTile.uploading(state, emit);
  } else if (state.archive.numFiles > 0) {
    left = archiveTile.wip(state, emit);
  } else {
    left = archiveTile.empty(state, emit);
  }

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

  const right =
    archives.length === 0
      ? intro(state)
      : list(archives, 'p-2 h-full overflow-y-auto w-full', 'mb-4 w-full');

  const myUploads = renderMyUploads(state);

  return html`
    <main class="main">
      ${state.modal && modal(state, emit)}
      <section
        class="h-full w-full p-6 md:p-8 overflow-hidden md:flex md:flex-row md:rounded-xl md:shadow-big"
      >
        <div class="px-2 w-full md:px-0 md:mr-8 md:w-1/2">${left}</div>
        <div class="mt-6 w-full md:w-1/2 md:-m-2">
          ${right}
          ${myUploads}
        </div>
      </section>
    </main>
  `;
};

function renderMyUploads(state) {
  if (!state.user || !state.user.isLocalAuth || !state.user.loggedIn) {
    return '';
  }
  const uploads = state.myUploads || [];

  function formatTtl(ttlMs) {
    if (ttlMs <= 0) return 'Expired';
    const hours = Math.floor(ttlMs / 3600000);
    if (hours < 24) return `${hours}h remaining`;
    return `${Math.floor(hours / 24)}d remaining`;
  }

  const rows = uploads.map(u => {
    const downloadText = u.alive
      ? `${u.dl}/${u.dlimit} downloads · ${formatTtl(u.ttlMs)}`
      : 'Expired';
    const sizeText = u.size ? bytes(u.size) : '';
    const shortId = u.id ? u.id.slice(0, 8) + '...' : '—';
    const downloadUrl = u.id ? `/download/${u.id}/` : null;

    return html`
      <li class="flex items-center justify-between py-2 border-b border-grey-20 dark:border-grey-70 last:border-0 text-sm">
        <div class="flex flex-col min-w-0 mr-2">
          ${downloadUrl && u.alive
            ? html`<a href="${downloadUrl}" class="link-primary font-medium truncate" title="${u.id}">${shortId}</a>`
            : html`<span class="text-grey-50 font-medium truncate" title="${u.id || '—'}">${shortId}</span>`
          }
          <span class="text-grey-50 dark:text-grey-40 text-xs">${sizeText}</span>
        </div>
        <span class="text-grey-50 dark:text-grey-40 whitespace-nowrap text-xs">${downloadText}</span>
      </li>
    `;
  });

  return html`
    <div class="mt-6 w-full">
      <h2 class="text-sm font-semibold text-grey-60 dark:text-grey-40 uppercase tracking-wide mb-2">
        My Uploads
      </h2>
      ${uploads.length === 0
        ? html`<p class="text-grey-50 dark:text-grey-40 text-sm">No uploads yet.</p>`
        : html`<ul class="w-full">${rows}</ul>`
      }
    </div>
  `;
}
