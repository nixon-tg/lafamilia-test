# La Familia Telegram Bot

Bot Telegram połączony z Mini App. Wersja przeznaczona do obsługi legalnego sklepu i kontaktu z klientami.

## Funkcje

- menu `/start`
- katalog produktów
- koszyk z ilościami
- tworzenie zamówień
- SQLite
- panel administratora przez `/admin`
- zmiana statusu `/status ID STATUS`
- przycisk otwierający Mini App
- kontakt przez Telegram
- dane użytkownika i zamówienia przechowywane lokalnie

## Uruchomienie

1. Zainstaluj Node.js 20+.
2. Wejdź do `bot/`.
3. Uruchom `npm install`.
4. Skopiuj `.env.example` do `.env`.
5. Wpisz token z BotFather do `BOT_TOKEN`.
6. W `ADMIN_IDS` wpisz numeryczne ID administratorów.
7. Ustaw `WEB_APP_URL` na adres wdrożonej Mini App.
8. Uruchom `npm start`.

Nigdy nie umieszczaj tokena Telegram w repozytorium GitHub.

## Statusy zamówień

`new` → `processing` → `ready` → `completed`

Możliwe jest też `cancelled`.

## Ważne

Katalog zawiera wyłącznie przykładowe legalne produkty. Przed wdrożeniem należy zastąpić je rzeczywistą ofertą zgodną z prawem i regulaminami dostawców płatności oraz Telegrama.
