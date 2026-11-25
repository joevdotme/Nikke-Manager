// Sign In and cloud save. The committed default is off.
// The Pages deploy overwrites this file in the artifact only, and only when
// joevdotme.github.io is an authorized Firebase domain. localhost does not count.
window.NIKKE_FEATURES = { firebase: false };

(function () {
    function applySignInFlag() {
        var btn = document.getElementById("auth-btn");
        if (!btn) return;
        btn.hidden = !(window.NIKKE_FEATURES && window.NIKKE_FEATURES.firebase === true);
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applySignInFlag);
    } else {
        applySignInFlag();
    }
})();
