/*
 * キャッシュ優先＋裏で更新（stale-while-revalidate）。
 * 起動時はキャッシュから即座に表示するので、電波が弱いジムでも待たされない。
 * 更新版の取得は裏で走らせてキャッシュだけ差し替えるため、
 * 新しい index.html が画面に出るのは次回の起動から。
 * コードを更新したら CACHE のバージョンを必ず上げること（古いキャッシュの破棄用）。
 */
const CACHE = 'workout-v2';
const ASSETS = ['./', './index.html', './icon.png', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put(req, copy));
          }
          return res;
        })
        // 通信が失敗しても裏の更新なので握りつぶす。キャッシュが無いときだけ index.html を返す
        .catch(() => hit || caches.match('./index.html'));
      if (hit) {
        // キャッシュを即返した後も更新の取得が終わるまで SW を止めさせない
        event.waitUntil(fresh.catch(() => {}));
        return hit;
      }
      return fresh;
    })
  );
});
