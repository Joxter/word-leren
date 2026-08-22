import { Window } from "happy-dom";
import fs from "fs";
const html = fs.readFileSync("./saper.html", "utf8");
function boot(store) {
  const w = new Window({ url: "http://localhost/", width: 1200, height: 900 });
  w.console = console;
  for (const [k, v] of Object.entries(store || {})) w.localStorage.setItem(k, JSON.stringify(v));
  w.document.write(html);
  new w.Function(w.document.querySelector("script").textContent)();
  return w;
}
const w = boot({ "saper.flagbtn": true });
const d = w.document, cells = [...d.getElementById("field").children];
const tool = d.getElementById("flagmode");
console.log("hasflag on body:", d.body.className, "| tool html has svg+label:", tool.innerHTML.includes("<svg") && tool.textContent.includes("Режим"));
console.log("--cs set:", d.documentElement.style.getPropertyValue("--cs"));

const down = (el, b, buttons) => el.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, button: b, buttons }));
const up = (b) => d.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: b, buttons: 0 }));

// turn flag mode on, then left-click should flag
tool.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
console.log("tool active:", tool.className.includes("on"));
down(cells[10], 0, 1); up(0);
console.log("left click in flag mode -> flag:", cells[10].innerHTML.includes("svg"), "| still hidden:", cells[10].className.includes("hid"));
const lit = [...d.getElementById("mines").querySelectorAll("i.on")].length;
console.log("counter went 010 -> 009:", lit === 18);
// turn off, left click digs
tool.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
down(cells[40], 0, 1); up(0);
console.log("flag mode off -> digs:", cells.filter(c => c.className.includes("open")).length > 0);
// menu contains the new item
d.querySelector('[data-menu="game"]').dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, button: 0 }));
const items = [...d.querySelectorAll(".menu .item")].map(i => i.textContent.trim());
console.log("menu:", items.join(" | "));
