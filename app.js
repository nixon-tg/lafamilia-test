// La Familia Shop - app.js (Etap 2.4)

// Telegram WebApp
const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();

    document.documentElement.style.setProperty(
        "--tg-bg",
        tg.themeParams.bg_color || "#000000"
    );
}

// Routing SPA
const homeScreen = document.getElementById("home-screen");
const menuScreen = document.getElementById("menu-screen");
const contactScreen = document.getElementById("contact-screen");

const menuBtn = document.getElementById("open-menu");
const contactBtn = document.getElementById("open-contact");

function hideAll() {
    homeScreen?.classList.add("hidden");
    menuScreen?.classList.add("hidden");
    contactScreen?.classList.add("hidden");
}

function openScreen(screen) {
    hideAll();
    screen?.classList.remove("hidden");
    screen?.classList.add("fade-in");
}

menuBtn?.addEventListener("click", e => {
    e.preventDefault();
    openScreen(menuScreen);
});

contactBtn?.addEventListener("click", e => {
    e.preventDefault();
    openScreen(contactScreen);
});

// Powrót przyciskiem systemowym Telegram
if (tg) {
    tg.BackButton.onClick(() => {
        tg.BackButton.hide();
        openScreen(homeScreen);
    });
}

function updateBackButton() {
    const homeVisible = !homeScreen.classList.contains("hidden");

    if (!tg) return;

    if (homeVisible) {
        tg.BackButton.hide();
    } else {
        tg.BackButton.show();
    }
}

["click"].forEach(evt => {
    document.addEventListener(evt, () => {
        setTimeout(updateBackButton, 10);
    });
});

// Saldo (tymczasowo)
const balance = document.getElementById("balance");

function loadBalance() {
    const demoBalance = "0,00 zł";
    if (balance) balance.textContent = demoBalance;
}

loadBalance();

// Miejsce na przyszłą synchronizację
async function syncTelegramUser() {
    if (!tg?.initDataUnsafe?.user) return;

    const user = tg.initDataUnsafe.user;

    console.log("Telegram User:", {
        id: user.id,
        username: user.username,
        first_name: user.first_name
    });

    // TODO:
    // fetch('/api/user')
    // fetch('/api/balance')
}

syncTelegramUser();
