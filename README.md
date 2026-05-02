# PlayMatrix Clean v4.0

Bu teslim, eski faz dosyaları ve parçalı frontend kalıntıları taşınmadan sıfırdan kurulmuş modüler PlayMatrix yapısıdır.

## Çalıştırma

```bash
npm install
npm start
```

## Temel Dosya Standardı

- Ana sayfa: `/index.html`, `/script.js`, `/style.css`
- Satranç: `/games/chess/index.html`, `/games/chess/script.js`, `/games/chess/style.css`
- Pişti: `/games/pisti/index.html`, `/games/pisti/script.js`, `/games/pisti/style.css`
- Crash: `/games/crash/index.html`, `/games/crash/script.js`, `/games/crash/style.css`
- Backend giriş: `/server.js`

## Firebase / Render

Gizli değerler sadece ENV üzerinden okunur. Frontend tarafına yalnızca public Firebase web config değerleri `/api/auth/public-config` üzerinden verilir.

## Veri Politikası

- Kritik ve kalıcı veriler: Firestore
- Önemli fakat kalıcı olmayan olaylar: Render console
- Geçici oda, queue, presence, runtime log: Render in-memory
- UI-only tekrar bildirimleri: Local/session + runtime dedupe

## Production Smoke Test

```bash
npm install
npm run check
npm start
```

Tarayıcı kontrolleri:

1. `/` ana sayfa açılır.
2. Modal sistemi, avatar/çerçeve seçici ve e-posta güncelleme modalı açılır.
3. `/games/chess/`, `/games/pisti/`, `/games/crash/` sayfaları açılır.
4. Hızlı eşleşme butonları socket bağlantısı kurar.
5. Aynı bildirim sayfa yenileme ve logout/login sonrasında tekrar gösterilmez.
