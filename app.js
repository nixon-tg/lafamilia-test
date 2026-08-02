const tg = window.Telegram?.WebApp;
if(tg){
  tg.ready();
  tg.expand();
}

const balance = document.getElementById("balance");

// Przykładowa synchronizacja z backendem.
// Docelowo saldo pobierane po Telegram ID.
async function loadBalance(){
  balance.textContent = "0.00 PLN";
}
loadBalance();

document.getElementById("menuBtn").onclick=()=>alert("MENU");
document.getElementById("contactBtn").onclick=()=>alert("KONTAKT");
