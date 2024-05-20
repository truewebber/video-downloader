## This is a Chrome Extention.
### Was written for a specific case, but it could work with other websites with iframe embeded HLS video.

PS. Code is shit, but it works.

---

### To build

install deps
```bash
npm ci
```

build js
```bash
npm run build
```

copy static
```bash
npm run build:static
```

dist dir will contain unpacked extenstion

---

### TODO

- convert video to mp4 from MPEG-2 (.ts)
- improve extention by dividing frontend and backend parts.
