// Runs synchronously during parsing, before anything paints. Only ever true
// inside the Capacitor WebView — real kaupet.no visitors never see this
// class or the #native-boot-splash overlay (see styles.css) — eller når
// utvikleren har bedt om native-grenene med ?forcenative. Dev-flagget er
// gatet til dev-verter for å ha samme semantikk som isNative() i
// src/lib/native.ts, der grenen kun finnes bak import.meta.env.DEV og altså
// er strippet bort i staging/prod-bygg. Ekte Capacitor-deteksjon over er
// UGATET og virker i alle miljøer. Overlayet fjernes uansett når appen
// mounter, så et ?forcenative mot prod (der dev-flagget ikke slår inn) står
// ikke fast.
(function () {
  var native = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
  if (
    !native &&
    /^(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|192\.168(\.\d{1,3}){2})$/.test(
      window.location.hostname,
    )
  ) {
    try {
      var p = new URLSearchParams(window.location.search).get("forcenative");
      if (p === null) native = sessionStorage.getItem("kaupet.forceNative") === "true";
      else native = p !== "0" && p !== "false";
    } catch (e) {}
  }
  if (native) document.documentElement.classList.add("native-boot");
})();

// Runs before paint so there is no light-mode flash for users who have
// chosen (or whose system prefers) dark mode. Kept in sync with the
// resolution logic in src/hooks/use-theme.tsx.
(function () {
  try {
    var t = localStorage.getItem("kaupet_theme");
    var d =
      t === "dark" ||
      ((t === "system" || !t) && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (d) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
