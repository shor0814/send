import assets from '../common/assets';
import { getFileList, setFileList } from './api';
import { encryptStream, decryptStream } from './ece';
import { arrayToB64, b64ToArray, streamToArrayBuffer } from './utils';
import { blobStream } from './streams';
import { getFileListKey, prepareScopedBundleKey, preparePkce } from './fxa';
import storage from './storage';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const anonId = arrayToB64(crypto.getRandomValues(new Uint8Array(16)));

async function hashId(id) {
  const d = new Date();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const encoded = textEncoder.encode(`${id}:${year}:${month}`);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return arrayToB64(new Uint8Array(hash.slice(16)));
}

export default class User {
  constructor(storage, limits, authConfig) {
    this.authConfig = authConfig;
    this.limits = limits;
    this.storage = storage;
    this.data = storage.user || {};
  }

  get info() {
    return this.data || this.storage.user || {};
  }

  set info(data) {
    this.data = data;
    this.storage.user = data;
  }

  get firstAction() {
    return this.storage.get('firstAction');
  }

  set firstAction(action) {
    this.storage.set('firstAction', action);
  }

  get surveyed() {
    return this.storage.get('surveyed');
  }

  set surveyed(yes) {
    this.storage.set('surveyed', yes);
  }

  get avatar() {
    const defaultAvatar = assets.get('user.svg');
    if (this.info.avatarDefault) {
      return defaultAvatar;
    }
    return this.info.avatar || defaultAvatar;
  }

  get isLocalAuth() {
    return this.authConfig && this.authConfig.type === 'local';
  }

  get localToken() {
    try {
      return localStorage.getItem('sendLocalToken');
    } catch (e) {
      return null;
    }
  }

  get loggedIn() {
    if (this.isLocalAuth) {
      return !!this.localToken;
    }
    return !!this.info.access_token;
  }

  get bearerToken() {
    if (this.isLocalAuth) {
      return this.localToken;
    }
    return this.info.access_token;
  }

  get email() {
    if (this.isLocalAuth) {
      try {
        const data = JSON.parse(localStorage.getItem('sendLocalUser') || '{}');
        return data.email || null;
      } catch (e) {
        return null;
      }
    }
    return this.info.email;
  }

  get name() {
    if (this.isLocalAuth) {
      try {
        const data = JSON.parse(localStorage.getItem('sendLocalUser') || '{}');
        return data.name || data.email || null;
      } catch (e) {
        return null;
      }
    }
    return this.info.displayName;
  }

  get refreshToken() {
    return this.info.refresh_token;
  }

  get maxSize() {
    return this.limits.MAX_FILE_SIZE;
  }

  get maxExpireSeconds() {
    return this.limits.MAX_EXPIRE_SECONDS;
  }

  get maxDownloads() {
    return this.limits.MAX_DOWNLOADS;
  }

  async metricId() {
    return this.loggedIn ? hashId(this.info.uid) : undefined;
  }

  async deviceId() {
    return this.loggedIn ? hashId(this.storage.id) : hashId(anonId);
  }

  async fetchMyUploads() {
    if (!this.isLocalAuth || !this.localToken) {
      return [];
    }
    const res = await fetch('/api/auth/uploads', {
      headers: { 'X-Local-Auth': this.localToken }
    });
    if (!res.ok) return [];
    return res.json();
  }

  async localLogin(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('sendLocalToken', data.token);
    localStorage.setItem('sendLocalUser', JSON.stringify({ id: data.id, email: data.email, name: data.name, tier: data.tier }));
  }

  async localRegister(email, password, name) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem('sendLocalToken', data.token);
    localStorage.setItem('sendLocalUser', JSON.stringify({ id: data.id, email: data.email, name: data.name, tier: data.tier }));
  }

  localLogout() {
    localStorage.removeItem('sendLocalToken');
    localStorage.removeItem('sendLocalUser');
  }

  async startAuthFlow(trigger, utms = {}) {
    this.utms = utms;
    this.trigger = trigger;
    this.flowId = null;
    this.flowBeginTime = null;
  }

  async login(email) {
    const state = arrayToB64(crypto.getRandomValues(new Uint8Array(16)));
    storage.set('oauthState', state);
    const keys_jwk = await prepareScopedBundleKey(this.storage);
    const code_challenge = await preparePkce(this.storage);
    const options = {
      action: 'email',
      access_type: 'offline',
      client_id: this.authConfig.client_id,
      code_challenge,
      code_challenge_method: 'S256',
      response_type: 'code',
      scope: `profile ${this.authConfig.key_scope}`,
      state,
      keys_jwk
    };
    if (email) {
      options.email = email;
    }
    if (this.flowId && this.flowBeginTime) {
      options.flow_id = this.flowId;
      options.flow_begin_time = this.flowBeginTime;
    }
    if (this.trigger) {
      options.entrypoint = `send-${this.trigger}`;
    }
    if (this.utms) {
      options.utm_campaign = this.utms.campaign || 'none';
      options.utm_content = this.utms.content || 'none';
      options.utm_medium = this.utms.medium || 'none';
      options.utm_source = this.utms.source || 'send';
      options.utm_term = this.utms.term || 'none';
    }
    const params = new URLSearchParams(options);
    location.assign(
      `${this.authConfig.authorization_endpoint}?${params.toString()}`
    );
  }

  async finishLogin(code, state) {
    const localState = storage.get('oauthState');
    storage.remove('oauthState');
    if (state !== localState) {
      throw new Error('state mismatch');
    }
    const tokenResponse = await fetch(this.authConfig.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        client_id: this.authConfig.client_id,
        code_verifier: this.storage.get('pkceVerifier')
      })
    });
    const auth = await tokenResponse.json();
    const infoResponse = await fetch(this.authConfig.userinfo_endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.access_token}`
      }
    });
    const userInfo = await infoResponse.json();
    userInfo.access_token = auth.access_token;
    userInfo.refresh_token = auth.refresh_token;
    userInfo.fileListKey = await getFileListKey(this.storage, auth.keys_jwe);
    this.info = userInfo;
    this.storage.remove('pkceVerifier');
  }

  async refresh() {
    if (!this.refreshToken) {
      return false;
    }
    try {
      const tokenResponse = await fetch(this.authConfig.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: this.authConfig.client_id,
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken
        })
      });
      if (tokenResponse.ok) {
        const auth = await tokenResponse.json();
        const info = { ...this.info, access_token: auth.access_token };
        this.info = info;
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    await this.logout();
    return false;
  }

  async logout() {
    if (this.isLocalAuth) {
      this.localLogout();
      this.storage.clearLocalFiles();
      return;
    }
    try {
      if (this.refreshToken) {
        await fetch(this.authConfig.revocation_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            refresh_token: this.refreshToken
          })
        });
      }
      if (this.bearerToken) {
        await fetch(this.authConfig.revocation_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            token: this.bearerToken
          })
        });
      }
    } catch (e) {
      console.error(e);
      // oh well, we tried
    }
    this.storage.clearLocalFiles();
    this.info = {};
  }

  async syncFileList() {
    let changes = { incoming: false, outgoing: false, downloadCount: false };
    if (!this.loggedIn || this.isLocalAuth) {
      return this.storage.merge();
    }
    let list = [];
    const key = b64ToArray(this.info.fileListKey);
    const sha = await crypto.subtle.digest('SHA-256', key);
    const kid = arrayToB64(new Uint8Array(sha)).substring(0, 16);
    const retry = async () => {
      const refreshed = await this.refresh();
      if (refreshed) {
        return await this.syncFileList();
      } else {
        return { incoming: true };
      }
    };
    try {
      const encrypted = await getFileList(this.bearerToken, kid);
      const decrypted = await streamToArrayBuffer(
        decryptStream(blobStream(encrypted), key)
      );
      list = JSON.parse(textDecoder.decode(decrypted));
    } catch (e) {
      if (e.message === '401') {
        return retry(e);
      }
    }
    changes = await this.storage.merge(list);
    if (!changes.outgoing) {
      return changes;
    }
    try {
      const blob = new Blob([
        textEncoder.encode(JSON.stringify(this.storage.files))
      ]);
      const encrypted = await streamToArrayBuffer(
        encryptStream(blobStream(blob), key)
      );
      await setFileList(this.bearerToken, kid, encrypted);
    } catch (e) {
      if (e.message === '401') {
        return retry(e);
      }
    }
    return changes;
  }

  toJSON() {
    return this.info;
  }
}
