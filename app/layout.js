import "./globals.css";

export const metadata = {
  title: "Meme Video Editor",
  description: "Editor local para montar video y texto sobre una plantilla"
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
