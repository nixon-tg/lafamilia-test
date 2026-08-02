const tg=window.Telegram?.WebApp;
if(tg){tg.ready();tg.expand();}
function openMenu(){console.log("MENU");}
function openContact(){console.log("KONTAKT");}
document.getElementById("menuBtn").onclick=openMenu;
document.getElementById("contactBtn").onclick=openContact;
