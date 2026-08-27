// Runs synchronously during parsing, before anything paints. Only ever true
// inside the Capacitor WebView — real kaupet.no visitors never see this
// class or the #native-boot-splash overlay (see styles.css).
if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-boot");
}

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
