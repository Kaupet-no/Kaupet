// Runs synchronously during parsing, before anything paints. Only ever true
// inside the Capacitor WebView — real kaupet.no visitors never see this
// class or the #native-boot-splash overlay (see styles.css) — eller når
// utvikleren har bedt om native-grenene med ?forcenative (samme semantikk
// som isNative() i src/lib/native.ts, som kjører for sent til å dekke
// SSR-malingen). Overlayet fjernes uansett når appen mounter, så et
// ?forcenative mot prod (der flagget er strippet) står ikke fast.
(function () {
  var native = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
  if (!native) {
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
