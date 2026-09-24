# Meme Video Editor

Editor web pensado para reels/memes con una plantilla fija:

- subís una plantilla PNG/JPG;
- subís un video;
- escribís el texto;
- el texto siempre queda alineado al borde izquierdo del video;
- la separación texto/video se mantiene fija;
- texto + video forman un único bloque que se centra automáticamente;
- podés hacer zoom, mover y recortar el encuadre del video;
- podés recortar inicio/fin;
- exporta MP4 preservando el audio del video cuando existe.

## Privacidad y costo

No necesita API, base de datos ni IA. El video se procesa en tu propio navegador con FFmpeg WebAssembly. Vercel solamente aloja la interfaz.

La primera exportación descarga el motor FFmpeg al navegador (~30 MB). Para videos largos o 4K puede consumir bastante RAM; para reels cortos funciona mejor.

## Subir a GitHub

1. Creá un repositorio nuevo, por ejemplo `meme-video-editor`.
2. En GitHub: **Add file → Upload files**.
3. Subí **el contenido de esta carpeta**, no el ZIP cerrado.
4. Asegurate de que `package.json` quede en la raíz del repositorio.
5. Hacé **Commit changes**.

La estructura debe verse así:

```text
app/
  globals.css
  layout.js
  page.js
package.json
README.md
```

## Subir a Vercel

1. En Vercel: **Add New → Project**.
2. Importá el repo de GitHub.
3. Vercel debería detectar **Next.js** automáticamente.
4. No hace falta agregar Environment Variables.
5. Tocá **Deploy**.

## Uso

1. Subí la plantilla final.
2. Subí el video.
3. Escribí el texto.
4. Ajustá ancho/alto del marco del video.
5. Arrastrá directamente sobre el video en la vista previa para reencuadrarlo.
6. Usá Zoom si necesitás acercar.
7. Ajustá Inicio/Fin si querés recortar el clip.
8. Exportá MP4.

## Fuente personalizada

Podés subir tu propia fuente `.ttf`, `.otf`, `.woff` o `.woff2`. La fuente se usa localmente y no se sube al servidor.
