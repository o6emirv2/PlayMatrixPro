# PlayMatrix v4 Clean Rebuild

Bu paket eski faz/legacy dosyalarını taşımadan sıfırdan kurulmuş sade PlayMatrix mimarisidir.

## Çalıştırma

```bash
npm install
npm start
```

## Ana Yapı

- Ana sayfa: `/index.html`, `/script.js`, `/style.css`
- Oyun frontendleri: `/games/<game>/index.html`, `/games/<game>/script.js`, `/games/<game>/style.css`
- Backend giriş: `/server.js`
- Backend modüller: `/server/*`

## ENV

Firebase ve Render değerleri `.env.example` içindeki contract ile sağlanır. Gizli değerler frontend tarafına yazılmaz.
