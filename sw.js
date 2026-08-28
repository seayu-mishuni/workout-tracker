/*
 * キャッシュ優先＋裏で更新（stale-while-revalidate）。
 * 起動時はキャッシュから即座に表示するので、電波が弱いジムでも待たされない。
 * 更新版の取得は裏で走らせてキャッシュだけ差し替えるため、
 * 新しい index.html が画面に出るのは次回の起動から。
 * コードを更新したら CACHE のバージョンを必ず上げること（古いキャッシュの破棄用）。
 */
const CACHE = 'workout-v4';
const ASSETS = ['./', './index.html', './icon.png', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // reload 指定でブラウザのHTTPキャッシュを迂回する。
      // これが無いと新規インストール時点で既に古い index.html を掴むことがある。
      .then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
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
      // ブラウザ自身のHTTPキャッシュに邪魔されると、裏で取り直しても同じ古い中身を
      // 書き戻してしまい永久に更新されない。no-cache で必ずサーバに確認させる。
      // req をそのまま渡すと navigate モードのリクエストでは例外になるため URL から作り直す。
      const fresh = fetch(new Request(req.url, { cache: 'no-cache' }))
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
