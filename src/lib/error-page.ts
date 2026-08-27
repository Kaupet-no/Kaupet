export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="nb">
  <head>
    <meta charset="utf-8" />
    <title>Kaupet.no – siden lastet ikke</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      .logo { margin: 0 0 1.25rem; font-family: Georgia, "Newsreader", serif; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
      .logo .accent { color: #b5502f; }
      .logo .muted { color: #6b7280; font-weight: 400; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #1f3d34; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="logo">kaupet<span class="accent">.</span><span class="muted">no</span></p>
      <h1>Siden lastet ikke</h1>
      <p>Noe gikk galt hos oss. Prøv å laste siden på nytt, eller gå tilbake til forsiden.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Prøv igjen</button>
        <a class="secondary" href="/">Gå til forsiden</a>
      </div>
    </div>
  </body>
</html>`;
}
