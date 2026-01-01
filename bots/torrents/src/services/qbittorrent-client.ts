import { qBitTorrentHost } from '../config.js';
import { TorrentStatus } from '../types.js';
import { fetchWithTimeout, HttpStatusError } from './http.js';

export async function addTorrent(form: FormData): Promise<void> {
  const url = `${qBitTorrentHost}/api/v2/torrents/add`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    body: form,
    noProxy: true,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`qBittorrent add failed: ${response.status} ${response.statusText} ${body}`);
  }
}

export async function listTorrents(filter: string): Promise<TorrentStatus[]> {
  const url = `${qBitTorrentHost}/api/v2/torrents/info?filter=${encodeURIComponent(filter)}`;
  const response = await fetchWithTimeout(url, { noProxy: true });

  if (!response.ok) {
    throw new HttpStatusError(url, response.status, response.statusText);
  }

  const text = await response.text();
  return JSON.parse(text) as TorrentStatus[];
}

export async function deleteTorrent(hash: string, deleteFiles: boolean): Promise<Response> {
  const url = `${qBitTorrentHost}/api/v2/torrents/delete`;
  return fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      hashes: hash,
      deleteFiles: deleteFiles ? 'true' : 'false',
    }),
    noProxy: true,
  });
}
